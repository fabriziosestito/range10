# Contributing to range10

Contributions are welcome. This document covers the local development and iOS
hardware workflows.

## Prerequisites

- Node.js 20 or 22 and npm
- Rust 1.94 or newer
- The Tauri 2 platform prerequisites for your operating system
- macOS and full Xcode for iOS development
- A Garmin Approach R10 for real protocol testing

Install JavaScript dependencies with:

```sh
npm install
```

## Development

Browser mode is useful for interface work but does not provide real BLE,
protocol, or shot data. Run the desktop Tauri app for native integration:

```sh
make macos-dev
```

Useful commands:

```sh
make lint            # Fast static checks (eslint + clippy)
make check           # Lint, frontend build, Rust format, clippy, and cargo check
make test            # Frontend (vitest) and Rust unit tests
make macos-build     # Build the macOS application bundle
make macos-run       # Open an existing bundle without rebuilding
make macos-install   # Build and install /Applications/range10.app
make clean           # Remove frontend and Rust build output
make help            # List all targets grouped by platform
```

`make check` performs static and build verification. `make test` runs the
automated test suite.

## iOS Setup

Install full Xcode, open it once, accept its license, and select it as the
active developer directory:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

Install the remaining tools and Rust targets:

```sh
brew install cocoapods xcodegen libimobiledevice ios-deploy protobuf
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

Initialize the generated iOS project when required (one-time, destructive —
it regenerates `src-tauri/gen/apple`):

```sh
npx tauri ios init
```

The Xcode project `src-tauri/gen/apple/app.xcodeproj` is generated output and
is not tracked. `tauri ios build` regenerates it from the tracked
`src-tauri/gen/apple/project.yml` (XcodeGen) on every build, so no manual step
is needed for normal development. The tracked `app_iOS/` directory holds the
customizations (Bluetooth usage text, entitlements, sources); preserve them
when regenerating the project.

Tauri requires an installed iOS Simulator runtime even for physical-device
builds. Install one from Xcode or run (one-time):

```sh
xcodebuild -downloadPlatform iOS
```

## Local Apple Signing

Apple Team IDs and signing credentials must not be committed. Create the local
Tauri override from the tracked example:

```sh
cp src-tauri/tauri.ios.conf.example.json src-tauri/tauri.ios.conf.json
```

Replace `YOUR_APPLE_TEAM_ID` with the Team ID shown in your Apple Developer
account. `src-tauri/tauri.ios.conf.json` is ignored and is merged automatically
for iOS commands. CI may use the `APPLE_DEVELOPMENT_TEAM` environment variable
instead.

The Team ID is injected into the untracked generated
`src-tauri/gen/apple/app.xcodeproj` on each build, so `git status` stays clean
and the Team ID never appears in tracked files. Do not force-add the generated
project back into version control.

Add your Apple ID under **Xcode > Settings > Accounts**. Automatic signing is
enabled by default. A free Personal Team can work for device testing, but its
provisioning expires quickly.

Never commit certificates, provisioning profiles, archives, API keys, device
identifiers, or exported IPAs.

## Physical iPhone Setup

1. Connect and unlock the iPhone.
2. Trust the Mac when prompted.
3. Enable **Settings > Privacy & Security > Developer Mode**.
4. Open **Xcode > Window > Devices and Simulators**.
5. Wait until the device is available for development.

List connected devices with:

```sh
make ios-list
```

Run or install on a physical device:

```sh
make ios-dev
make ios-run DEVICE="Your iPhone name or UDID"
```

Build or sideload a debugging IPA:

```sh
make ios-build
make ios-install DEVICE="Your device UDID"
```

## R10 Hardware Notes

The app manages the BLE connection itself. Do not pair the R10 through iOS
Bluetooth settings. Garmin Golf and other clients must be disconnected first.

The protocol uses the R10 MultiLink service:

- Service: `6A4E2800-667B-11E3-949A-0800200C9A66`
- Registration and notifications: `6A4E2810-667B-11E3-949A-0800200C9A66`
- Protocol writes: `6A4E2820-667B-11E3-949A-0800200C9A66`

The generated Apple project includes the Bluetooth usage description,
`CoreBluetooth.framework`, and the required background modes. Preserve those
customizations when regenerating the project.

## Pull Requests

Keep changes focused and explain user-visible behavior. Run `make check` before
submitting. Changes to BLE parsing, Tauri permissions, Apple project files, or
background behavior should include hardware and platform verification notes.
