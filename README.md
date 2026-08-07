# range10

range10 is a cross-platform golf range companion for the Garmin Approach R10,
built for speed training, practice sessions, and live shot analysis. It
connects directly to the launch monitor over Bluetooth, displays shot metrics,
keeps a session log, and speaks the measurements you choose.

The app is built with React and Tauri and is designed to work without an
internet connection.

## Features

- Direct Bluetooth connection to the Garmin Approach R10
- Live club speed, path, face, attack angle, tempo, launch, ball speed, and spin
- Configurable spoken feedback after every shot
- Imperial and metric units
- Scrollable shot log for the current session
- Remembered device and feedback preferences
- Responsive interfaces for macOS and iOS

Shot-flight visualization and persistent shot history are not implemented yet.

## Connect Your R10

1. Turn on the R10 and keep it nearby.
2. Close Garmin Golf and any other app connected to the launch monitor.
3. Open range10 and select **Connect**.
4. Allow Bluetooth access and choose the Approach R10.
5. Wait for the app to report that it is connected, then take a shot.

The R10 is connected from within range10, not from the operating system's
Bluetooth settings.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, local signing setup,
build commands, and hardware notes.

## Project Status

range10 is under active development. Hardware behavior can vary by R10
firmware and platform, so reports from real range sessions are welcome.

## License

This project is distributed under the GNU General Public License v3.0 only.
Bundled font and icon licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Disclaimer

range10 is an independent project and is not affiliated with, endorsed by, or
sponsored by Garmin. Garmin and Approach are trademarks of Garmin Ltd. or its
subsidiaries.
