#!/usr/bin/env swift

import AppKit
import AVFoundation
import Foundation

private func fail(_ message: String) -> Never {
    fputs("Error: \(message)\n", stderr)
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    fail("Usage: swift scripts/qa-love-story.swift INPUT_MP4 [FRAME_OUTPUT_DIR]")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let frameDirectory = CommandLine.arguments.count >= 3
    ? URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
    : nil
let asset = AVURLAsset(url: inputURL)
let duration = asset.duration.seconds
let videoTracks = asset.tracks(withMediaType: .video)
let audioTracks = asset.tracks(withMediaType: .audio)

guard let video = videoTracks.first else {
    fail("No video track in \(inputURL.path)")
}

let transformedSize = video.naturalSize.applying(video.preferredTransform)
let width = Int(abs(transformedSize.width).rounded())
let height = Int(abs(transformedSize.height).rounded())
let estimatedFrames = Int((duration * Double(video.nominalFrameRate)).rounded())

print("file=\(inputURL.lastPathComponent)")
print(String(format: "duration=%.3f", duration))
print("size=\(width)x\(height)")
print(String(format: "fps=%.3f", video.nominalFrameRate))
print("estimatedFrames=\(estimatedFrames)")
print("videoTracks=\(videoTracks.count)")
print("audioTracks=\(audioTracks.count)")
print("videoBitrate=\(Int(video.estimatedDataRate.rounded()))")

for (index, track) in audioTracks.enumerated() {
    let description = track.formatDescriptions.first
        .map { String(describing: $0) }
        ?? "unknown"
    print("audio[\(index)]=\(description)")
}

guard let frameDirectory else {
    exit(0)
}

do {
    try FileManager.default.createDirectory(
        at: frameDirectory,
        withIntermediateDirectories: true
    )
} catch {
    fail(error.localizedDescription)
}

let requestedTimes: [Double] = [
    1.5, 7.5, 15.0, 22.5, 30.0, 38.0, 41.0, 44.0, 48.0,
    52.5, 57.0, 61.0, 65.0, 68.0, 71.0, 76.0, 84.0, 92.0
]
let times = duration < 2
    ? [max(0, duration * 0.5)]
    : requestedTimes.filter { $0 < duration }
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = CMTime(seconds: 0.03, preferredTimescale: 600)
generator.requestedTimeToleranceAfter = CMTime(seconds: 0.03, preferredTimescale: 600)
generator.maximumSize = CGSize(width: 960, height: 540)

for (index, seconds) in times.enumerated() {
    do {
        let image = try generator.copyCGImage(
            at: CMTime(seconds: seconds, preferredTimescale: 600),
            actualTime: nil
        )
        let bitmap = NSBitmapImageRep(cgImage: image)
        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            fail("Could not encode frame \(index + 1)")
        }
        let name = String(format: "%02d-%05.1fs.png", index + 1, seconds)
        let outputURL = frameDirectory.appendingPathComponent(name)
        try png.write(to: outputURL)
        print("frame=\(outputURL.path)")
    } catch {
        fail("Frame at \(seconds)s failed: \(error.localizedDescription)")
    }
}
