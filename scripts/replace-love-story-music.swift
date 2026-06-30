#!/usr/bin/env swift

import AVFoundation
import Foundation

private func fail(_ message: String) -> Never {
    fputs("Error: \(message)\n", stderr)
    exit(1)
}

guard CommandLine.arguments.count == 5 else {
    fail(
        "Usage: swift scripts/replace-love-story-music.swift "
            + "INPUT_VIDEO INPUT_AUDIO SOURCE_START_SECONDS OUTPUT_VIDEO"
    )
}

let videoURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let audioURL = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
guard let sourceStartSeconds = Double(CommandLine.arguments[3]),
      sourceStartSeconds >= 0 else {
    fail("SOURCE_START_SECONDS must be a non-negative number.")
}
let outputURL = URL(fileURLWithPath: CommandLine.arguments[4]).standardizedFileURL

let videoAsset = AVURLAsset(url: videoURL)
let audioAsset = AVURLAsset(url: audioURL)

guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
    fail("Input video has no video track.")
}
guard let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first else {
    fail("Input audio has no audio track.")
}

let videoDuration = videoAsset.duration
let sourceStart = CMTime(seconds: sourceStartSeconds, preferredTimescale: 600)
let availableAudio = CMTimeSubtract(audioAsset.duration, sourceStart)
guard availableAudio >= videoDuration else {
    fail(
        String(
            format: "Audio after %.3f seconds is shorter than the %.3f-second video.",
            sourceStartSeconds,
            videoDuration.seconds
        )
    )
}

let composition = AVMutableComposition()
guard let videoTrack = composition.addMutableTrack(
    withMediaType: .video,
    preferredTrackID: kCMPersistentTrackID_Invalid
), let audioTrack = composition.addMutableTrack(
    withMediaType: .audio,
    preferredTrackID: kCMPersistentTrackID_Invalid
) else {
    fail("Could not create composition tracks.")
}

do {
    try videoTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: videoDuration),
        of: sourceVideoTrack,
        at: .zero
    )
    videoTrack.preferredTransform = sourceVideoTrack.preferredTransform

    try audioTrack.insertTimeRange(
        CMTimeRange(start: sourceStart, duration: videoDuration),
        of: sourceAudioTrack,
        at: .zero
    )
} catch {
    fail(error.localizedDescription)
}

let musicVolume: Float = 0.72
let fadeInDuration = CMTime(seconds: 1.2, preferredTimescale: 600)
let fadeOutDuration = CMTime(seconds: 3.5, preferredTimescale: 600)
let fadeOutStart = CMTimeSubtract(videoDuration, fadeOutDuration)

let parameters = AVMutableAudioMixInputParameters(track: audioTrack)
parameters.setVolumeRamp(
    fromStartVolume: 0,
    toEndVolume: musicVolume,
    timeRange: CMTimeRange(start: .zero, duration: fadeInDuration)
)
parameters.setVolume(musicVolume, at: fadeInDuration)
parameters.setVolumeRamp(
    fromStartVolume: musicVolume,
    toEndVolume: 0,
    timeRange: CMTimeRange(start: fadeOutStart, duration: fadeOutDuration)
)

let audioMix = AVMutableAudioMix()
audioMix.inputParameters = [parameters]

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
exporter.audioMix = audioMix

let semaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { semaphore.signal() }
semaphore.wait()

guard exporter.status == .completed else {
    fail(exporter.error?.localizedDescription ?? "Music replacement export failed.")
}

print(
    String(
        format: "Wrote %@ using audio %.3f–%.3f seconds",
        outputURL.path,
        sourceStartSeconds,
        sourceStartSeconds + videoDuration.seconds
    )
)
