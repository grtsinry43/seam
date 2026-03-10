// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "seam-swift",
    products: [
        .library(name: "SeamSwift", targets: ["SeamSwift"])
    ],
    targets: [
        .target(name: "SeamSwift", path: "Sources/SeamSwift"),
        .testTarget(name: "SeamSwiftTests", dependencies: ["SeamSwift"], path: "Tests/SeamSwiftTests"),
    ]
)
