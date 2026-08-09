SHELL := /bin/zsh

APP_NAME := range10
APP_BUNDLE := src-tauri/target/release/bundle/macos/$(APP_NAME).app
INSTALL_PATH := /Applications/$(APP_NAME).app
IOS_IPA := src-tauri/gen/apple/build/arm64/range10.ipa
IOS_EXTRACT := /tmp/range10-ios-sideload

.PHONY: deps lint check test format clean help macos-dev macos-build macos-install macos-run ios-dev ios-build ios-install ios-run ios-list

## Shared targets.

deps: node_modules/.package-lock.json

node_modules/.package-lock.json: package-lock.json
	npm ci

# Fast static checks only.
lint:
	npm run lint
	cargo clippy --workspace --lib -- -D warnings

check:
	npm run lint
	npm run build
	cargo fmt --all -- --check
	cargo clippy --workspace --lib -- -D warnings
	cargo check --workspace

test:
	npm run test
	cargo test --workspace --lib
	cargo test -p libgolf-rs --doc

format:
	cargo fmt --all

clean:
	rm -rf dist target src-tauri/target

## macOS.

# Incremental desktop development loop with hot reload.
macos-dev:
	npm run tauri:dev

# Release .app bundle.
macos-build:
	npm run tauri:build -- --bundles app

# Build, install into /Applications, and open range10.
macos-install: macos-build
	@osascript -e 'tell application "$(APP_NAME)" to quit' 2>/dev/null || true
	@rm -rf "$(INSTALL_PATH)"
	@ditto "$(APP_BUNDLE)" "$(INSTALL_PATH)"
	@open "$(INSTALL_PATH)"
	@printf 'Installed %s\n' "$(INSTALL_PATH)"

# Open an existing release bundle without rebuilding or reinstalling it.
macos-run:
	@test -d "$(APP_BUNDLE)" || (printf 'App bundle not found. Run make macos-build first.\n' && exit 1)
	@open "$(APP_BUNDLE)"

## iOS.

ios-dev:
	npm run tauri:ios

# Debugging IPA.
ios-build: node_modules/.package-lock.json
	npx tauri ios build --ci --export-method debugging

# Debugging IPA sideloaded onto a connected device.
# Usage: make ios-install DEVICE="Your iPhone name or UDID"
ios-install: ios-build
	rm -rf "$(IOS_EXTRACT)"
	mkdir -p "$(IOS_EXTRACT)"
	unzip -q "$(IOS_IPA)" -d "$(IOS_EXTRACT)"
	if [[ -n "$(DEVICE)" ]]; then ios-deploy --id "$(DEVICE)" --bundle "$(IOS_EXTRACT)/Payload/range10.app"; else ios-deploy --bundle "$(IOS_EXTRACT)/Payload/range10.app"; fi

# Release build run on a device.
# Usage: make ios-run DEVICE="Your iPhone name or UDID"
ios-run:
	@test -n "$(DEVICE)" || (printf 'Usage: make ios-run DEVICE="Your iPhone name or UDID"\n' && exit 1)
	npx tauri ios run --release "$(DEVICE)"

ios-list:
	xcrun devicectl list devices

## Help.

help:
	@echo 'Shared:'
	@echo '  make deps        Restore npm dependencies'
	@echo '  make lint        Fast static checks (eslint + clippy)'
	@echo '  make check       Full pre-commit/CI verification'
	@echo '  make test        Frontend (vitest) and Rust unit tests'
	@echo '  make format      Format Rust source'
	@echo '  make clean       Remove frontend and Rust build output'
	@echo ''
	@echo 'macOS:'
	@echo '  make macos-dev      Tauri desktop dev loop'
	@echo '  make macos-build    Release .app bundle'
	@echo '  make macos-install  Build, install into /Applications, and open'
	@echo '  make macos-run      Open existing bundle without rebuilding'
	@echo ''
	@echo 'iOS:'
	@echo '  make ios-dev        Tauri iOS dev loop'
	@echo '  make ios-build      Debugging IPA'
	@echo '  make ios-install    Build and sideload IPA to a device'
	@echo '  make ios-run DEVICE=...    Release run on a device'
	@echo '  make ios-list       List connected devices'