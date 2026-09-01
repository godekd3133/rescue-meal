import Foundation
import ImageIO
import Vision

struct Observation: Encodable {
    let text: String
    let confidence: Float
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
}

struct Output: Encodable {
    let file: String
    let status: String
    let observations: [Observation]
    let error: String?
}

guard CommandLine.arguments.count >= 2 else {
    fputs("usage: macos_vision_ocr.swift IMAGE_PATH\n", stderr)
    exit(2)
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    let output = Output(file: path, status: "failed", observations: [], error: "image_decode_failed")
    print(String(data: try! JSONEncoder().encode(output), encoding: .utf8)!)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
request.usesLanguageCorrection = true

do {
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    let observations = (request.results ?? []).compactMap { result -> Observation? in
        guard let candidate = result.topCandidates(1).first else { return nil }
        let box = result.boundingBox
        return Observation(
            text: candidate.string,
            confidence: candidate.confidence,
            x: box.origin.x,
            y: box.origin.y,
            width: box.size.width,
            height: box.size.height
        )
    }
    let output = Output(file: path, status: "complete", observations: observations, error: nil)
    print(String(data: try! JSONEncoder().encode(output), encoding: .utf8)!)
} catch {
    let output = Output(file: path, status: "failed", observations: [], error: String(describing: error))
    print(String(data: try! JSONEncoder().encode(output), encoding: .utf8)!)
    exit(1)
}
