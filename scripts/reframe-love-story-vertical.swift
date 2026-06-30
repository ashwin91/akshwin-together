#!/usr/bin/env swift

import AVFoundation
import CoreGraphics
import Foundation

private func fail(_ message: String) -> Never {
    fputs("Error: \(message)\n", stderr)
    exit(1)
}

guard CommandLine.arguments.count == 3 else {
    fail("Usage: swift scripts/reframe-love-story-vertical.swift INPUT_MP4 OUTPUT_MP4")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
let sourceAsset = AVURLAsset(url: inputURL)

guard let sourceVideo = sourceAsset.tracks(withMediaType: .video).first else {
    fail("Input has no video track.")
}

let composition = AVMutableComposition()
guard let videoTrack = composition.addMutableTrack(
    withMediaType: .video,
    preferredTrackID: kCMPersistentTrackID_Invalid
) else {
    fail("Could not create the video track.")
}

do {
    try videoTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: sourceAsset.duration),
        of: sourceVideo,
        at: .zero
    )
} catch {
    fail(error.localizedDescription)
}

if let sourceAudio = sourceAsset.tracks(withMediaType: .audio).first,
   let audioTrack = composition.addMutableTrack(
       withMediaType: .audio,
       preferredTrackID: kCMPersistentTrackID_Invalid
   ) {
    try? audioTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: sourceAsset.duration),
        of: sourceAudio,
        at: .zero
    )
}

let targetSize = CGSize(width: 1080, height: 1920)
let sourceSize = sourceVideo.naturalSize
let scale = max(
    targetSize.width / sourceSize.width,
    targetSize.height / sourceSize.height
)
let scaledWidth = sourceSize.width * scale
let scaledHeight = sourceSize.height * scale
let translateX = (targetSize.width - scaledWidth) * 0.5
let translateY = (targetSize.height - scaledHeight) * 0.5

let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: sourceAsset.duration)
let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
var transform = sourceVideo.preferredTransform
transform = transform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
transform = transform.concatenating(
    CGAffineTransform(translationX: translateX / scale, y: translateY / scale)
)
layerInstruction.setTransform(transform, at: .zero)
instruction.layerInstructions = [layerInstruction]

let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = targetSize
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
videoComposition.instructions = [instruction]

try? FileManager.default.removeItem(at: outputURL)
guard let exporter = AVAssetExportSession(
    asset: composition,
    presetName: AVAssetExportPresetHighestQuality
) else {
    fail("Could not create the export session.")
}

exporter.outputURL = outputURL
exporter.outputFileType = .mp4
exporter.shouldOptimizeForNetworkUse = true
exporter.videoComposition = videoComposition

let semaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { semaphore.signal() }
semaphore.wait()

guard exporter.status == .completed else {
    fail(exporter.error?.localizedDescription ?? "Vertical export failed.")
}

print("Wrote \(outputURL.path)")
