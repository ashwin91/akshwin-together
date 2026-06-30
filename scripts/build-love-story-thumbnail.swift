#!/usr/bin/env swift

import AppKit
import CoreGraphics
import Foundation

private let canvasSize = NSSize(width: 1920, height: 1080)

private func fail(_ message: String) -> Never {
    fputs("Error: \(message)\n", stderr)
    exit(1)
}

guard CommandLine.arguments.count == 3 else {
    fail("Usage: swift scripts/build-love-story-thumbnail.swift INPUT_IMAGE OUTPUT_PNG")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL

guard let source = NSImage(contentsOf: inputURL) else {
    fail("Could not load \(inputURL.path)")
}

let image = NSImage(size: canvasSize)
image.lockFocus()

NSColor(calibratedRed: 0.97, green: 0.94, blue: 0.89, alpha: 1).setFill()
NSRect(origin: .zero, size: canvasSize).fill()

let sourceSize = source.size
let scale = max(canvasSize.width / sourceSize.width, canvasSize.height / sourceSize.height)
let drawSize = NSSize(width: sourceSize.width * scale, height: sourceSize.height * scale)
let drawRect = NSRect(
    x: (canvasSize.width - drawSize.width) * 0.5,
    y: (canvasSize.height - drawSize.height) * 0.5,
    width: drawSize.width,
    height: drawSize.height
)
source.draw(
    in: drawRect,
    from: NSRect(origin: .zero, size: sourceSize),
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
)

let plate = NSRect(x: 470, y: 724, width: 980, height: 234)
let platePath = NSBezierPath(roundedRect: plate, xRadius: 30, yRadius: 30)
NSColor(calibratedRed: 0.07, green: 0.22, blue: 0.17, alpha: 0.58).setFill()
platePath.fill()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center

let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Baskerville", size: 86)
        ?? NSFont.systemFont(ofSize: 86, weight: .semibold),
    .foregroundColor: NSColor(
        calibratedRed: 0.98,
        green: 0.91,
        blue: 0.68,
        alpha: 1
    ),
    .paragraphStyle: paragraph,
    .kern: 1.8
]
let subtitleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Avenir Next Medium", size: 39)
        ?? NSFont.systemFont(ofSize: 39, weight: .medium),
    .foregroundColor: NSColor(
        calibratedRed: 1,
        green: 0.98,
        blue: 0.94,
        alpha: 1
    ),
    .paragraphStyle: paragraph,
    .kern: 2.2
]

NSAttributedString(
    string: "Ashwin & Akshata",
    attributes: titleAttributes
).draw(in: NSRect(x: 500, y: 823, width: 920, height: 96))

NSAttributedString(
    string: "FOREVER BEGINS HERE",
    attributes: subtitleAttributes
).draw(in: NSRect(x: 500, y: 761, width: 920, height: 54))

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fail("Could not encode the thumbnail.")
}

do {
    try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    try png.write(to: outputURL)
    print("Wrote \(outputURL.path)")
} catch {
    fail(error.localizedDescription)
}
