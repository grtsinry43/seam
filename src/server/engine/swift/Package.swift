// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "seam-engine-swift",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "SeamEngine", targets: ["SeamEngine"])
    ],
    dependencies: [
        .package(url: "https://github.com/swiftwasm/WasmKit", from: "0.2.0")
    ],
    targets: [
        .target(name: "SeamEngine", dependencies: ["WasmKit"], path: "Sources/SeamEngine"),
        .testTarget(
            name: "SeamEngineTests", dependencies: ["SeamEngine"], path: "Tests/SeamEngineTests"),
    ]
)
