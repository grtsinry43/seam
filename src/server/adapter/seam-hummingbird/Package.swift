// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "seam-adapter-hummingbird",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "SeamHummingbird", targets: ["SeamHummingbird"])
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird", from: "2.0.0"),
        .package(path: "../../core/seam-swift"),
    ],
    targets: [
        .target(
            name: "SeamHummingbird",
            dependencies: [
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "SeamSwift", package: "seam-swift"),
            ],
            path: "Sources/SeamHummingbird"
        ),
        .testTarget(
            name: "SeamHummingbirdTests", dependencies: ["SeamHummingbird"],
            path: "Tests/SeamHummingbirdTests"),
    ]
)
