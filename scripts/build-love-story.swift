#!/usr/bin/env swift

/*
 Native macOS love-story video assembler.

 Requirements:
   - macOS 13 or newer
   - Xcode Command Line Tools (`xcode-select --install`)
   - No ffmpeg or third-party packages

 Run directly:
   swift scripts/build-love-story.swift \
     video/love-story/manifest.example.json \
     --variant all

 Or compile once:
   swiftc scripts/build-love-story.swift \
     -o /tmp/build-love-story \
     -framework AVFoundation \
     -framework AppKit \
     -framework CoreGraphics \
     -framework CoreImage \
     -framework CoreText \
     -framework ImageIO \
     -framework VideoToolbox

   /tmp/build-love-story video/love-story/manifest.example.json --variant all

 Variants:
   full             narration + music + ambience + text
   no-voiceover     music + ambience + text
   music-and-text   music + text
   all              exports all three variants

 Paths in the manifest are resolved relative to the manifest file. Use
 `--output-dir /absolute/or/relative/path` to override output.directory.
 */

import AppKit
import AVFoundation
import CoreGraphics
import CoreImage
import CoreMedia
import CoreText
import CoreVideo
import Foundation
import ImageIO
import VideoToolbox

private var outputWidth = 1920
private var outputHeight = 1080
private let outputFPS: Int32 = 30
private let defaultBitrate = 12_000_000

private enum BuildError: LocalizedError {
    case usage(String)
    case invalidManifest(String)
    case missingFile(URL)
    case imageLoad(URL)
    case writer(String)
    case audio(String)

    var errorDescription: String? {
        switch self {
        case .usage(let message), .invalidManifest(let message),
             .writer(let message), .audio(let message):
            return message
        case .missingFile(let url):
            return "File not found: \(url.path)"
        case .imageLoad(let url):
            return "Could not decode image: \(url.path)"
        }
    }
}

private struct Manifest: Decodable {
    let output: OutputOptions?
    let style: StyleOptions?
    let decorations: DecorationOptions?
    let audio: AudioOptions?
    let scenes: [Scene]
}

private struct OutputOptions: Decodable {
    let directory: String?
    let baseName: String?
    let bitrate: Int?
    let width: Int?
    let height: Int?
}

private struct StyleOptions: Decodable {
    let backgroundColor: String?
    let titleColor: String?
    let subtitleColor: String?
    let plateColor: String?
    let plateOpacity: Double?
    let titleFont: String?
    let subtitleFont: String?
    let titleSize: Double?
    let subtitleSize: Double?
    let accentColor: String?
}

private struct DecorationOptions: Decodable {
    let petals: Bool?
    let goldThread: Bool?
    let intensity: Double?
    let seed: Int?
}

private struct AudioOptions: Decodable {
    let narrationPath: String?
    let narrationVolume: Double?
    let musicPath: String?
    let musicVolume: Double?
    let musicLoop: Bool?
    let musicSourceStart: Double?
    let musicFadeIn: Double?
    let musicFadeOut: Double?
    let ambience: [AudioCue]?
}

private struct AudioCue: Decodable {
    let path: String
    let startTime: Double?
    let duration: Double?
    let volume: Double?
}

private struct Scene: Decodable {
    let image: String
    let duration: Double
    let text: String?
    let subtitle: String?
    let textPositionY: Double?
    let textMaxWidth: Double?
    let titleSize: Double?
    let subtitleSize: Double?
    let textColor: String?
    let transition: String?
    let transitionDuration: Double?
    let kenBurns: KenBurns?
}

private struct KenBurns: Decodable {
    let startScale: Double?
    let endScale: Double?
    let startX: Double?
    let startY: Double?
    let endX: Double?
    let endY: Double?
}

private enum Variant: String, CaseIterable {
    case full
    case noVoiceover = "no-voiceover"
    case musicAndText = "music-and-text"

    var includesNarration: Bool { self == .full }
    var includesAmbience: Bool { self != .musicAndText }
}

private struct CommandLineOptions {
    let manifestURL: URL
    let variants: [Variant]
    let outputDirectoryOverride: String?
}

private struct ResolvedScene {
    let source: Scene
    let imageURL: URL
    let startTime: Double
}

private struct RenderStyle {
    let background: CGColor
    let title: CGColor
    let subtitle: CGColor
    let plate: CGColor
    let plateOpacity: CGFloat
    let titleFont: String
    let subtitleFont: String
    let titleSize: CGFloat
    let subtitleSize: CGFloat
    let accent: CGColor
}

private struct Particle {
    let x: CGFloat
    let y: CGFloat
    let size: CGFloat
    let speed: CGFloat
    let drift: CGFloat
    let phase: CGFloat
    let hue: Int
}

private struct VideoWriterPipeline {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    let adaptor: AVAssetWriterInputPixelBufferAdaptor
    let settings: [String: Any]
}

private final class FrameRenderer {
    private let scenes: [ResolvedScene]
    private let style: RenderStyle
    private let decoration: DecorationOptions?
    private let imageCache: [URL: CGImage]
    private let particles: [Particle]
    private let width = CGFloat(outputWidth)
    private let height = CGFloat(outputHeight)

    init(scenes: [ResolvedScene], style: RenderStyle, decoration: DecorationOptions?) throws {
        self.scenes = scenes
        self.style = style
        self.decoration = decoration

        var cache: [URL: CGImage] = [:]
        for scene in scenes where cache[scene.imageURL] == nil {
            cache[scene.imageURL] = try Self.loadImage(scene.imageURL)
        }
        imageCache = cache
        particles = Self.makeParticles(
            intensity: decoration?.intensity ?? 0.55,
            seed: decoration?.seed ?? 42
        )
    }

    func render(time: Double, into pixelBuffer: CVPixelBuffer) throws {
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw BuildError.writer("Could not access the video pixel buffer.")
        }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue
            | CGImageAlphaInfo.premultipliedFirst.rawValue

        guard let context = CGContext(
            data: baseAddress,
            width: outputWidth,
            height: outputHeight,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else {
            throw BuildError.writer("Could not create a CoreGraphics frame context.")
        }

        // Work in a conventional top-left coordinate system.
        context.translateBy(x: 0, y: height)
        context.scaleBy(x: 1, y: -1)
        context.setFillColor(style.background)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        let index = sceneIndex(at: time)
        let scene = scenes[index]
        let localTime = max(0, time - scene.startTime)
        let sceneProgress = clamp(localTime / scene.source.duration)
        let transitionDuration = min(
            max(0, scene.source.transitionDuration ?? 1.0),
            scene.source.duration * 0.5
        )
        let transitionName = (scene.source.transition ?? "crossfade").lowercased()

        if index > 0, transitionName != "none", transitionDuration > 0,
           localTime < transitionDuration {
            let previous = scenes[index - 1]
            let transitionProgress = smoothstep(localTime / transitionDuration)
            drawTransition(
                context: context,
                previous: previous,
                current: scene,
                currentProgress: sceneProgress,
                progress: transitionProgress,
                type: transitionName
            )
        } else {
            drawSceneImage(context: context, scene: scene, progress: sceneProgress, alpha: 1)
        }

        if decoration?.petals ?? true {
            drawPetals(context: context, time: time)
        }
        if decoration?.goldThread ?? true {
            drawGoldThread(context: context, time: time)
        }

        let transitionOpacity: Double
        if index > 0, transitionDuration > 0, localTime < transitionDuration {
            transitionOpacity = smoothstep(localTime / transitionDuration)
        } else {
            transitionOpacity = 1
        }
        let textOpacity = overlayOpacity(
            localTime: localTime,
            duration: scene.source.duration
        ) * transitionOpacity
        drawText(context: context, scene: scene.source, opacity: CGFloat(textOpacity))
    }

    private func sceneIndex(at time: Double) -> Int {
        var low = 0
        var high = scenes.count - 1
        while low < high {
            let middle = (low + high + 1) / 2
            if scenes[middle].startTime <= time {
                low = middle
            } else {
                high = middle - 1
            }
        }
        return low
    }

    private func drawTransition(
        context: CGContext,
        previous: ResolvedScene,
        current: ResolvedScene,
        currentProgress: Double,
        progress: Double,
        type: String
    ) {
        switch type {
        case "fade", "fade-through-cream":
            if progress < 0.5 {
                drawSceneImage(
                    context: context,
                    scene: previous,
                    progress: 1,
                    alpha: CGFloat(1 - progress * 2)
                )
            } else {
                drawSceneImage(
                    context: context,
                    scene: current,
                    progress: currentProgress,
                    alpha: CGFloat((progress - 0.5) * 2)
                )
            }
        case "wipe":
            drawSceneImage(context: context, scene: previous, progress: 1, alpha: 1)
            context.saveGState()
            context.clip(to: CGRect(x: 0, y: 0, width: width * progress, height: height))
            drawSceneImage(
                context: context,
                scene: current,
                progress: currentProgress,
                alpha: 1
            )
            context.restoreGState()
        default:
            drawSceneImage(context: context, scene: previous, progress: 1, alpha: 1)
            drawSceneImage(
                context: context,
                scene: current,
                progress: currentProgress,
                alpha: CGFloat(progress)
            )
        }
    }

    private func drawSceneImage(
        context: CGContext,
        scene: ResolvedScene,
        progress: Double,
        alpha: CGFloat
    ) {
        guard let image = imageCache[scene.imageURL] else { return }
        let motion = scene.source.kenBurns
        let startScale = motion?.startScale ?? 1.0
        let endScale = motion?.endScale ?? 1.08
        let startX = motion?.startX ?? 0.5
        let startY = motion?.startY ?? 0.5
        let endX = motion?.endX ?? startX
        let endY = motion?.endY ?? startY
        let eased = easeInOut(progress)

        let zoom = lerp(startScale, endScale, eased)
        let focalX = lerp(startX, endX, eased)
        let focalY = lerp(startY, endY, eased)
        let imageWidth = CGFloat(image.width)
        let imageHeight = CGFloat(image.height)
        let aspectFill = max(width / imageWidth, height / imageHeight)
        let scale = aspectFill * CGFloat(max(1, zoom))
        let drawWidth = imageWidth * scale
        let drawHeight = imageHeight * scale

        var originX = width * 0.5 - CGFloat(focalX) * drawWidth
        var originY = height * 0.5 - CGFloat(focalY) * drawHeight
        originX = min(0, max(width - drawWidth, originX))
        originY = min(0, max(height - drawHeight, originY))

        context.saveGState()
        context.setAlpha(alpha)
        context.interpolationQuality = .high
        // CGImage draws upside down in the renderer's top-left coordinate space.
        // Flip around this image's own vertical center without affecting overlays.
        context.translateBy(x: 0, y: originY * 2 + drawHeight)
        context.scaleBy(x: 1, y: -1)
        context.draw(
            image,
            in: CGRect(x: originX, y: originY, width: drawWidth, height: drawHeight)
        )
        context.restoreGState()
    }

    private func drawText(context: CGContext, scene: Scene, opacity: CGFloat) {
        guard opacity > 0.001, scene.text != nil || scene.subtitle != nil else { return }

        let maxWidth = width * CGFloat(clamp(scene.textMaxWidth ?? 0.68, 0.3, 0.9))
        let titleSize = CGFloat(scene.titleSize ?? Double(style.titleSize))
        let subtitleSize = CGFloat(scene.subtitleSize ?? Double(style.subtitleSize))
        let titleColor = scene.textColor.map(parseColor) ?? style.title
        let title = attributedText(
            scene.text,
            fontName: style.titleFont,
            size: titleSize,
            color: titleColor,
            opacity: opacity
        )
        let subtitle = attributedText(
            scene.subtitle,
            fontName: style.subtitleFont,
            size: subtitleSize,
            color: style.subtitle,
            opacity: opacity
        )
        let titleHeight = title.map { measuredHeight($0, width: maxWidth) } ?? 0
        let subtitleHeight = subtitle.map { measuredHeight($0, width: maxWidth) } ?? 0
        let gap: CGFloat = title != nil && subtitle != nil ? 16 : 0
        let contentHeight = titleHeight + gap + subtitleHeight
        let centerY = height * CGFloat(clamp(scene.textPositionY ?? 0.76, 0.15, 0.88))
        let contentY = centerY - contentHeight * 0.5
        let contentX = (width - maxWidth) * 0.5
        let insetX: CGFloat = 42
        let insetY: CGFloat = 28

        if style.plateOpacity > 0 {
            let plateRect = CGRect(
                x: contentX - insetX,
                y: contentY - insetY,
                width: maxWidth + insetX * 2,
                height: contentHeight + insetY * 2
            )
            context.saveGState()
            context.setFillColor(
                style.plate.copy(alpha: style.plateOpacity * opacity)
                    ?? style.plate
            )
            context.addPath(
                CGPath(
                    roundedRect: plateRect,
                    cornerWidth: 24,
                    cornerHeight: 24,
                    transform: nil
                )
            )
            context.fillPath()
            context.restoreGState()
        }

        var cursorY = contentY
        if let title {
            drawAttributed(
                title,
                context: context,
                rect: CGRect(x: contentX, y: cursorY, width: maxWidth, height: titleHeight)
            )
            cursorY += titleHeight + gap
        }
        if let subtitle {
            drawAttributed(
                subtitle,
                context: context,
                rect: CGRect(x: contentX, y: cursorY, width: maxWidth, height: subtitleHeight)
            )
        }
    }

    private func attributedText(
        _ value: String?,
        fontName: String,
        size: CGFloat,
        color: CGColor,
        opacity: CGFloat
    ) -> NSAttributedString? {
        guard let value, !value.isEmpty else { return nil }
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.lineSpacing = size * 0.08
        let font = NSFont(name: fontName, size: size)
            ?? NSFont.systemFont(ofSize: size, weight: .medium)
        let nsColor = NSColor(cgColor: color)?.withAlphaComponent(opacity)
            ?? NSColor.white.withAlphaComponent(opacity)
        return NSAttributedString(
            string: value,
            attributes: [
                .font: font,
                .foregroundColor: nsColor,
                .paragraphStyle: paragraph,
                .kern: size * 0.018
            ]
        )
    }

    private func measuredHeight(_ text: NSAttributedString, width: CGFloat) -> CGFloat {
        let framesetter = CTFramesetterCreateWithAttributedString(text)
        let size = CTFramesetterSuggestFrameSizeWithConstraints(
            framesetter,
            CFRange(location: 0, length: text.length),
            nil,
            CGSize(width: width, height: .greatestFiniteMagnitude),
            nil
        )
        return ceil(size.height + 8)
    }

    private func drawAttributed(
        _ text: NSAttributedString,
        context: CGContext,
        rect: CGRect
    ) {
        context.saveGState()
        // CoreText expects an upright, bottom-left local coordinate system.
        context.translateBy(x: 0, y: rect.minY + rect.height)
        context.scaleBy(x: 1, y: -1)
        let localRect = CGRect(x: rect.minX, y: 0, width: rect.width, height: rect.height)
        let path = CGPath(rect: localRect, transform: nil)
        let framesetter = CTFramesetterCreateWithAttributedString(text)
        let frame = CTFramesetterCreateFrame(
            framesetter,
            CFRange(location: 0, length: text.length),
            path,
            nil
        )
        CTFrameDraw(frame, context)
        context.restoreGState()
    }

    private func drawPetals(context: CGContext, time: Double) {
        let palette = [
            parseColor("#F3C6C8"),
            parseColor("#F7DFC4"),
            parseColor("#E9B949"),
            parseColor("#FFF8E8")
        ]
        context.saveGState()
        for particle in particles {
            let travel = particle.y + particle.speed * CGFloat(time)
            let y = travel.truncatingRemainder(dividingBy: height + 160) - 80
            let x = particle.x
                + sin(CGFloat(time) * 0.75 + particle.phase) * particle.drift
            let rect = CGRect(
                x: x - particle.size * 0.5,
                y: y - particle.size * 0.3,
                width: particle.size,
                height: particle.size * 0.6
            )
            context.saveGState()
            context.translateBy(x: rect.midX, y: rect.midY)
            context.rotate(by: sin(CGFloat(time) + particle.phase) * 0.55)
            context.translateBy(x: -rect.midX, y: -rect.midY)
            context.setFillColor(
                palette[particle.hue % palette.count].copy(alpha: 0.24)
                    ?? palette[particle.hue % palette.count]
            )
            context.fillEllipse(in: rect)
            context.restoreGState()
        }
        context.restoreGState()
    }

    private func drawGoldThread(context: CGContext, time: Double) {
        let phase = CGFloat(time) * 0.22
        let baseline = height * 0.86
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -40, y: baseline + sin(phase) * 20))
        path.addCurve(
            to: CGPoint(x: width + 40, y: baseline - 12 + sin(phase + 2.4) * 18),
            control1: CGPoint(
                x: width * 0.28,
                y: baseline - 90 + sin(phase + 0.8) * 30
            ),
            control2: CGPoint(
                x: width * 0.67,
                y: baseline + 75 + sin(phase + 1.6) * 26
            )
        )
        context.saveGState()
        context.setStrokeColor(style.accent.copy(alpha: 0.34) ?? style.accent)
        context.setLineWidth(2.2)
        context.setLineCap(.round)
        context.setShadow(
            offset: .zero,
            blur: 5,
            color: style.accent.copy(alpha: 0.2)
        )
        context.addPath(path)
        context.strokePath()
        context.restoreGState()
    }

    private func overlayOpacity(localTime: Double, duration: Double) -> Double {
        let fade = min(0.8, duration * 0.2)
        guard fade > 0 else { return 1 }
        let fadeIn = smoothstep(localTime / fade)
        let fadeOut = smoothstep((duration - localTime) / fade)
        return min(fadeIn, fadeOut)
    }

    private static func loadImage(_ url: URL) throws -> CGImage {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            throw BuildError.imageLoad(url)
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 4096,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(
            source,
            0,
            options as CFDictionary
        ) else {
            throw BuildError.imageLoad(url)
        }
        return image
    }

    private static func makeParticles(intensity: Double, seed: Int) -> [Particle] {
        let count = max(0, Int(round(22 * clamp(intensity, 0, 1.5))))
        return (0..<count).map { index in
            Particle(
                x: CGFloat(hash(index * 7 + 1, seed: seed)) * CGFloat(outputWidth),
                y: CGFloat(hash(index * 7 + 2, seed: seed)) * CGFloat(outputHeight + 160),
                size: 12 + CGFloat(hash(index * 7 + 3, seed: seed)) * 22,
                speed: 10 + CGFloat(hash(index * 7 + 4, seed: seed)) * 22,
                drift: 12 + CGFloat(hash(index * 7 + 5, seed: seed)) * 28,
                phase: CGFloat(hash(index * 7 + 6, seed: seed)) * .pi * 2,
                hue: Int(hash(index * 7 + 7, seed: seed) * 4)
            )
        }
    }

    private static func hash(_ value: Int, seed: Int) -> Double {
        let raw = sin(Double(value) * 12.9898 + Double(seed) * 78.233) * 43_758.5453
        return raw - floor(raw)
    }
}

private func parseArguments() throws -> CommandLineOptions {
    let arguments = Array(CommandLine.arguments.dropFirst())
    if arguments.isEmpty || arguments.contains("--help") || arguments.contains("-h") {
        throw BuildError.usage(
            """
            Usage:
              swift scripts/build-love-story.swift MANIFEST.json \
                [--variant full|no-voiceover|music-and-text|all] \
                [--output-dir PATH]
            """
        )
    }

    let manifestURL = URL(fileURLWithPath: arguments[0]).standardizedFileURL
    var variantValue = "all"
    var outputDirectory: String?
    var index = 1
    while index < arguments.count {
        switch arguments[index] {
        case "--variant":
            guard index + 1 < arguments.count else {
                throw BuildError.usage("--variant requires a value.")
            }
            variantValue = arguments[index + 1]
            index += 2
        case "--output-dir":
            guard index + 1 < arguments.count else {
                throw BuildError.usage("--output-dir requires a path.")
            }
            outputDirectory = arguments[index + 1]
            index += 2
        default:
            throw BuildError.usage("Unknown argument: \(arguments[index])")
        }
    }

    let variants: [Variant]
    if variantValue == "all" {
        variants = Variant.allCases
    } else if let variant = Variant(rawValue: variantValue) {
        variants = [variant]
    } else {
        throw BuildError.usage("Unknown variant: \(variantValue)")
    }
    return CommandLineOptions(
        manifestURL: manifestURL,
        variants: variants,
        outputDirectoryOverride: outputDirectory
    )
}

private func decodeManifest(at url: URL) throws -> Manifest {
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw BuildError.missingFile(url)
    }
    let data = try Data(contentsOf: url)
    do {
        return try JSONDecoder().decode(Manifest.self, from: data)
    } catch {
        throw BuildError.invalidManifest("Invalid manifest JSON: \(error)")
    }
}

private func resolvePath(_ path: String, relativeTo base: URL) -> URL {
    let expanded = NSString(string: path).expandingTildeInPath
    if expanded.hasPrefix("/") {
        return URL(fileURLWithPath: expanded).standardizedFileURL
    }
    return base.appendingPathComponent(expanded).standardizedFileURL
}

private func resolveScenes(_ manifest: Manifest, baseURL: URL) throws -> [ResolvedScene] {
    guard !manifest.scenes.isEmpty else {
        throw BuildError.invalidManifest("The manifest must contain at least one scene.")
    }
    var startTime = 0.0
    return try manifest.scenes.enumerated().map { index, scene in
        guard scene.duration > 0 else {
            throw BuildError.invalidManifest("Scene \(index + 1) must have a positive duration.")
        }
        let imageURL = resolvePath(scene.image, relativeTo: baseURL)
        guard FileManager.default.fileExists(atPath: imageURL.path) else {
            throw BuildError.missingFile(imageURL)
        }
        defer { startTime += scene.duration }
        return ResolvedScene(source: scene, imageURL: imageURL, startTime: startTime)
    }
}

private func makeStyle(_ options: StyleOptions?) -> RenderStyle {
    RenderStyle(
        background: parseColor(options?.backgroundColor ?? "#F7F0E5"),
        title: parseColor(options?.titleColor ?? "#FFF9EF"),
        subtitle: parseColor(options?.subtitleColor ?? "#FFF9EF"),
        plate: parseColor(options?.plateColor ?? "#173D32"),
        plateOpacity: CGFloat(clamp(options?.plateOpacity ?? 0.46, 0, 1)),
        titleFont: options?.titleFont ?? "Baskerville",
        subtitleFont: options?.subtitleFont ?? "Avenir Next",
        titleSize: CGFloat(options?.titleSize ?? 74),
        subtitleSize: CGFloat(options?.subtitleSize ?? 34),
        accent: parseColor(options?.accentColor ?? "#D4AF65")
    )
}

private func renderSilentVideo(
    scenes: [ResolvedScene],
    style: RenderStyle,
    decorations: DecorationOptions?,
    bitrate: Int,
    outputURL: URL
) throws {
    var pipeline = try makeVideoWriterPipeline(
        outputURL: outputURL,
        bitrate: bitrate,
        forceSoftwareEncoder: false
    )
    if !pipeline.writer.startWriting() {
        let hardwareError = pipeline.writer.error
        pipeline.writer.cancelWriting()
        pipeline = try makeVideoWriterPipeline(
            outputURL: outputURL,
            bitrate: bitrate,
            forceSoftwareEncoder: true
        )
        guard pipeline.writer.startWriting() else {
            throw BuildError.writer(
                "AVAssetWriter failed with both automatic and software H.264 "
                    + "encoder selection. Automatic: \(describeNSError(hardwareError)). "
                    + "Software: \(describeNSError(pipeline.writer.error)). "
                    + "Software settings: \(describeDictionary(pipeline.settings)). "
                    + "If both errors are AVFoundation -11834, the process cannot "
                    + "access the macOS encoder service; run it outside any restricted "
                    + "sandbox or grant the executable native media-encoder access."
            )
        }
        print(
            "Automatic H.264 encoder was unavailable; "
                + "using the VideoToolbox software encoder."
        )
    }
    let writer = pipeline.writer
    let input = pipeline.input
    let adaptor = pipeline.adaptor
    writer.startSession(atSourceTime: .zero)

    let renderer = try FrameRenderer(scenes: scenes, style: style, decoration: decorations)
    let duration = scenes.reduce(0) { $0 + $1.source.duration }
    let frameCount = Int(round(duration * Double(outputFPS)))
    let reportEvery = Int(outputFPS * 5)

    for frame in 0..<frameCount {
        while !input.isReadyForMoreMediaData {
            if writer.status == .failed {
                throw BuildError.writer(
                    "AVAssetWriter failed while waiting for input. "
                        + describeNSError(writer.error)
                )
            }
            Thread.sleep(forTimeInterval: 0.002)
        }

        try autoreleasepool {
            guard let pool = adaptor.pixelBufferPool else {
                throw BuildError.writer("AVAssetWriter did not create a pixel buffer pool.")
            }
            var optionalBuffer: CVPixelBuffer?
            let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &optionalBuffer)
            guard status == kCVReturnSuccess, let pixelBuffer = optionalBuffer else {
                throw BuildError.writer("Could not allocate video frame \(frame).")
            }
            let seconds = Double(frame) / Double(outputFPS)
            try renderer.render(time: seconds, into: pixelBuffer)
            let presentationTime = CMTime(value: CMTimeValue(frame), timescale: outputFPS)
            guard adaptor.append(pixelBuffer, withPresentationTime: presentationTime) else {
                throw BuildError.writer(
                    "Could not append frame \(frame). \(describeNSError(writer.error))"
                )
            }
        }

        if frame == 0 || (frame + 1) % reportEvery == 0 || frame == frameCount - 1 {
            let renderedSeconds = Double(frame + 1) / Double(outputFPS)
            print(String(format: "Rendered %.1f / %.1f seconds", renderedSeconds, duration))
        }
    }

    input.markAsFinished()
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    guard writer.status == .completed else {
        throw BuildError.writer(
            "AVAssetWriter did not complete. Status: \(writer.status.rawValue). "
                + describeNSError(writer.error)
        )
    }
}

private func makeVideoWriterPipeline(
    outputURL: URL,
    bitrate: Int,
    forceSoftwareEncoder: Bool
) throws -> VideoWriterPipeline {
    try removeIfPresent(outputURL)
    var settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: outputWidth,
        AVVideoHeightKey: outputHeight,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoExpectedSourceFrameRateKey: outputFPS,
            AVVideoMaxKeyFrameIntervalKey: outputFPS * 2,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
        ]
    ]
    if forceSoftwareEncoder {
        settings[AVVideoEncoderSpecificationKey] = [
            kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder as String: false
        ]
    }

    let writer: AVAssetWriter
    do {
        writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    } catch {
        throw BuildError.writer(
            "Could not create AVAssetWriter: \(describeNSError(error))"
        )
    }
    guard writer.canApply(outputSettings: settings, forMediaType: .video) else {
        throw BuildError.writer(
            "AVAssetWriter cannot apply the requested H.264 settings: "
                + "\(describeDictionary(settings))"
        )
    }

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: outputWidth,
        kCVPixelBufferHeightKey as String: outputHeight,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:]
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: attributes
    )
    guard writer.canAdd(input) else {
        throw BuildError.writer(
            "AVAssetWriter rejected the H.264 video input. "
                + "Settings: \(describeDictionary(settings))"
        )
    }
    writer.add(input)
    return VideoWriterPipeline(
        writer: writer,
        input: input,
        adaptor: adaptor,
        settings: settings
    )
}

private func exportVariant(
    variant: Variant,
    silentVideoURL: URL,
    outputURL: URL,
    audio: AudioOptions?,
    baseURL: URL
) throws {
    let sources = try audioSources(
        variant: variant,
        options: audio,
        baseURL: baseURL
    )
    if sources.isEmpty {
        try removeIfPresent(outputURL)
        try FileManager.default.copyItem(at: silentVideoURL, to: outputURL)
        return
    }

    let videoAsset = AVURLAsset(url: silentVideoURL)
    guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
        throw BuildError.audio("The rendered video has no video track.")
    }
    let duration = videoAsset.duration
    let composition = AVMutableComposition()
    guard let compositionVideoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
        throw BuildError.audio("Could not create the composition video track.")
    }
    try compositionVideoTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: duration),
        of: sourceVideoTrack,
        at: .zero
    )
    compositionVideoTrack.preferredTransform = sourceVideoTrack.preferredTransform

    var audioParameters: [AVAudioMixInputParameters] = []
    for source in sources {
        let asset = AVURLAsset(url: source.url)
        guard let sourceTrack = asset.tracks(withMediaType: .audio).first else {
            throw BuildError.audio("No audio track found in \(source.url.path)")
        }
        guard let destinationTrack = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw BuildError.audio("Could not create an audio composition track.")
        }

        let destinationStart = CMTime(seconds: source.startTime, preferredTimescale: 600)
        let availableSeconds = max(0, duration.seconds - source.startTime)
        guard availableSeconds > 0 else { continue }

        if source.loop {
            var cursor = destinationStart
            let sourceDuration = asset.duration
            let sourceStart = CMTime(seconds: source.sourceStartTime, preferredTimescale: 600)
            let availableSourceDuration = CMTimeSubtract(sourceDuration, sourceStart)
            guard availableSourceDuration.seconds > 0 else {
                throw BuildError.audio("Audio has no playable duration after \(source.sourceStartTime)s: \(source.url.path)")
            }
            while cursor < duration {
                let remaining = CMTimeSubtract(duration, cursor)
                let segmentDuration = CMTimeMinimum(availableSourceDuration, remaining)
                try destinationTrack.insertTimeRange(
                    CMTimeRange(start: sourceStart, duration: segmentDuration),
                    of: sourceTrack,
                    at: cursor
                )
                cursor = CMTimeAdd(cursor, segmentDuration)
            }
        } else {
            let availableSourceSeconds = max(0, asset.duration.seconds - source.sourceStartTime)
            let requested = source.duration ?? availableSourceSeconds
            let segmentSeconds = min(requested, availableSourceSeconds, availableSeconds)
            guard segmentSeconds > 0 else { continue }
            try destinationTrack.insertTimeRange(
                CMTimeRange(
                    start: CMTime(seconds: source.sourceStartTime, preferredTimescale: 600),
                    duration: CMTime(seconds: segmentSeconds, preferredTimescale: 600)
                ),
                of: sourceTrack,
                at: destinationStart
            )
        }

        let parameters = AVMutableAudioMixInputParameters(track: destinationTrack)
        let volume = Float(clamp(source.volume, 0, 2))
        parameters.setVolume(volume, at: destinationStart)

        if source.fadeIn > 0 {
            let fadeDuration = CMTime(
                seconds: min(source.fadeIn, availableSeconds),
                preferredTimescale: 600
            )
            parameters.setVolumeRamp(
                fromStartVolume: 0,
                toEndVolume: volume,
                timeRange: CMTimeRange(start: destinationStart, duration: fadeDuration)
            )
        }
        if source.fadeOut > 0 {
            let sourceEndSeconds = source.loop
                ? duration.seconds
                : min(
                    duration.seconds,
                    source.startTime + (source.duration ?? asset.duration.seconds)
                )
            let fadeSeconds = min(source.fadeOut, sourceEndSeconds - source.startTime)
            if fadeSeconds > 0 {
                let fadeStart = CMTime(
                    seconds: sourceEndSeconds - fadeSeconds,
                    preferredTimescale: 600
                )
                parameters.setVolumeRamp(
                    fromStartVolume: volume,
                    toEndVolume: 0,
                    timeRange: CMTimeRange(
                        start: fadeStart,
                        duration: CMTime(seconds: fadeSeconds, preferredTimescale: 600)
                    )
                )
            }
        }
        audioParameters.append(parameters)
    }

    let audioMix = AVMutableAudioMix()
    audioMix.inputParameters = audioParameters
    try removeIfPresent(outputURL)
    guard let exporter = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetHighestQuality
    ) else {
        throw BuildError.audio("Could not create an AVAssetExportSession.")
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true
    exporter.audioMix = audioMix

    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    guard exporter.status == .completed else {
        throw BuildError.audio(
            exporter.error?.localizedDescription ?? "Audio mix export failed."
        )
    }
}

private struct ResolvedAudioSource {
    let url: URL
    let startTime: Double
    let sourceStartTime: Double
    let duration: Double?
    let volume: Double
    let loop: Bool
    let fadeIn: Double
    let fadeOut: Double
}

private func audioSources(
    variant: Variant,
    options: AudioOptions?,
    baseURL: URL
) throws -> [ResolvedAudioSource] {
    guard let options else { return [] }
    var result: [ResolvedAudioSource] = []

    if variant.includesNarration, let path = options.narrationPath, !path.isEmpty {
        result.append(
            ResolvedAudioSource(
                url: try validatedAudioURL(path, baseURL: baseURL),
                startTime: 0,
                sourceStartTime: 0,
                duration: nil,
                volume: options.narrationVolume ?? 1,
                loop: false,
                fadeIn: 0.15,
                fadeOut: 0.35
            )
        )
    }

    if let path = options.musicPath, !path.isEmpty {
        result.append(
            ResolvedAudioSource(
                url: try validatedAudioURL(path, baseURL: baseURL),
                startTime: 0,
                sourceStartTime: max(0, options.musicSourceStart ?? 0),
                duration: nil,
                volume: options.musicVolume ?? 0.22,
                loop: options.musicLoop ?? true,
                fadeIn: options.musicFadeIn ?? 1.5,
                fadeOut: options.musicFadeOut ?? 3
            )
        )
    }

    if variant.includesAmbience {
        for cue in options.ambience ?? [] {
            result.append(
                ResolvedAudioSource(
                    url: try validatedAudioURL(cue.path, baseURL: baseURL),
                    startTime: max(0, cue.startTime ?? 0),
                    sourceStartTime: 0,
                    duration: cue.duration,
                    volume: cue.volume ?? 0.16,
                    loop: false,
                    fadeIn: 0.25,
                    fadeOut: 0.5
                )
            )
        }
    }
    return result
}

private func validatedAudioURL(_ path: String, baseURL: URL) throws -> URL {
    let url = resolvePath(path, relativeTo: baseURL)
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw BuildError.missingFile(url)
    }
    return url
}

private func removeIfPresent(_ url: URL) throws {
    if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
    }
}

private func describeNSError(_ error: Error?) -> String {
    guard let error else { return "No NSError was provided." }
    let nsError = error as NSError
    var details = [
        "domain=\(nsError.domain)",
        "code=\(nsError.code)",
        "description=\(nsError.localizedDescription)"
    ]
    if let reason = nsError.localizedFailureReason {
        details.append("reason=\(reason)")
    }
    if let suggestion = nsError.localizedRecoverySuggestion {
        details.append("suggestion=\(suggestion)")
    }
    if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? Error {
        details.append("underlying={\(describeNSError(underlying))}")
    }
    let remainingInfo = nsError.userInfo.filter {
        $0.key != NSUnderlyingErrorKey
            && $0.key != NSLocalizedDescriptionKey
            && $0.key != NSLocalizedFailureReasonErrorKey
            && $0.key != NSLocalizedRecoverySuggestionErrorKey
    }
    if !remainingInfo.isEmpty {
        details.append("userInfo=\(remainingInfo)")
    }
    return details.joined(separator: ", ")
}

private func describeDictionary(_ dictionary: [String: Any]) -> String {
    NSDictionary(dictionary: dictionary).description
}

private func parseColor(_ value: String) -> CGColor {
    var hex = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    if hex.count == 3 {
        hex = hex.map { "\($0)\($0)" }.joined()
    }
    guard hex.count == 6 || hex.count == 8,
          let raw = UInt64(hex, radix: 16) else {
        return CGColor(red: 1, green: 1, blue: 1, alpha: 1)
    }
    let hasAlpha = hex.count == 8
    let red = CGFloat((raw >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let green = CGFloat((raw >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let blue = CGFloat((raw >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let alpha = hasAlpha ? CGFloat(raw & 0xFF) / 255 : 1
    return CGColor(red: red, green: green, blue: blue, alpha: alpha)
}

private func clamp(_ value: Double, _ lower: Double = 0, _ upper: Double = 1) -> Double {
    min(upper, max(lower, value))
}

private func lerp(_ start: Double, _ end: Double, _ progress: Double) -> Double {
    start + (end - start) * progress
}

private func smoothstep(_ value: Double) -> Double {
    let x = clamp(value)
    return x * x * (3 - 2 * x)
}

private func easeInOut(_ value: Double) -> Double {
    0.5 - cos(clamp(value) * .pi) * 0.5
}

private func run() throws {
    let command = try parseArguments()
    let manifest = try decodeManifest(at: command.manifestURL)
    if let width = manifest.output?.width {
        guard width > 0 else {
            throw BuildError.invalidManifest("output.width must be positive.")
        }
        outputWidth = width
    }
    if let height = manifest.output?.height {
        guard height > 0 else {
            throw BuildError.invalidManifest("output.height must be positive.")
        }
        outputHeight = height
    }
    let manifestDirectory = command.manifestURL.deletingLastPathComponent()
    let scenes = try resolveScenes(manifest, baseURL: manifestDirectory)
    let duration = scenes.reduce(0) { $0 + $1.source.duration }
    let style = makeStyle(manifest.style)

    let outputDirectoryPath = command.outputDirectoryOverride
        ?? manifest.output?.directory
        ?? "exports"
    let outputDirectory = resolvePath(
        outputDirectoryPath,
        relativeTo: manifestDirectory
    )
    try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
    )
    let baseName = manifest.output?.baseName ?? "ashwin-akshata-love-story"
    let temporaryURL = outputDirectory.appendingPathComponent(
        ".\(baseName)-silent-\(UUID().uuidString).mp4"
    )
    defer { try? removeIfPresent(temporaryURL) }

    print(
        "Building \(String(format: "%.1f", duration))s at "
            + "\(outputWidth)x\(outputHeight), \(outputFPS)fps..."
    )
    try renderSilentVideo(
        scenes: scenes,
        style: style,
        decorations: manifest.decorations,
        bitrate: manifest.output?.bitrate ?? defaultBitrate,
        outputURL: temporaryURL
    )

    for variant in command.variants {
        let outputURL = outputDirectory.appendingPathComponent(
            "\(baseName)-\(variant.rawValue).mp4"
        )
        print("Mixing \(variant.rawValue)...")
        try exportVariant(
            variant: variant,
            silentVideoURL: temporaryURL,
            outputURL: outputURL,
            audio: manifest.audio,
            baseURL: manifestDirectory
        )
        print("Wrote \(outputURL.path)")
    }
}

do {
    try run()
} catch BuildError.usage(let message) {
    print(message)
    exit(message.hasPrefix("Usage:") ? 0 : 2)
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}
