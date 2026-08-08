SHELL := /bin/zsh

APP_NAME := range10
APP_BUNDLE := src-tauri/target/release/bundle/macos/$(APP_NAME).app
INSTALL_PATH := /Applications/$(APP_NAME).app
IOS_IPA := src-tauri/gen/apple/build/arm64/range10.ipa
IOS_EXTRACT := /tmp/range10-ios-sideload

.PHONY: install install-deps dev run run-app web check test format build bundle install-app ios ios-init ios-list ios-runtime ios-device ios-ipa ipa ios-sideload clean

install-deps:
	npm install

node_modules/.package-lock.json: package-lock.json
	npm ci

dev:
	npm run tauri:dev

# Incremental debug build and launch. This is the fastest development loop.
run: dev

# Launch the existing release bundle without rebuilding or reinstalling it.
run-app:
	@test -d "$(APP_BUNDLE)" || (printf 'App bundle not found. Run make bundle first.\n' && exit 1)
	@open "$(APP_BUNDLE)"

web:
	npm run dev

format:
	cargo fmt --manifest-path src-tauri/Cargo.toml --all

check:
	npm run lint
	npm run build
	cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
	cargo clippy --manifest-path src-tauri/Cargo.toml --lib -- -D warnings
	cargo check --manifest-path src-tauri/Cargo.toml

test:
	npm run test
	cargo test --manifest-path src-tauri/Cargo.toml --lib

build:
	npm run build

bundle:
	npm run tauri:build -- --bundles app

install-app: bundle
	@osascript -e 'tell application "$(APP_NAME)" to quit' 2>/dev/null || true
	@rm -rf "$(INSTALL_PATH)"
	@ditto "$(APP_BUNDLE)" "$(INSTALL_PATH)"
	@open "$(INSTALL_PATH)"
	@printf 'Installed %s\n' "$(INSTALL_PATH)"

install: install-app

ios:
	npm run tauri:ios

ios-init:
	npx tauri ios init

ios-list:
	xcrun devicectl list devices

ios-runtime:
	xcodebuild -downloadPlatform iOS

ios-device:
	@test -n "$(DEVICE)" || (printf 'Usage: make ios-device DEVICE="Your iPhone name or UDID"\n' && exit 1)
	npx tauri ios run --release "$(DEVICE)"

ios-ipa: node_modules/.package-lock.json
	npx tauri ios build --ci --export-method debugging

ipa: ios-ipa

ios-sideload: ios-ipa
	rm -rf "$(IOS_EXTRACT)"
	mkdir -p "$(IOS_EXTRACT)"
	unzip -q "$(IOS_IPA)" -d "$(IOS_EXTRACT)"
	if [[ -n "$(DEVICE)" ]]; then ios-deploy --id "$(DEVICE)" --bundle "$(IOS_EXTRACT)/Payload/range10.app"; else ios-deploy --bundle "$(IOS_EXTRACT)/Payload/range10.app"; fi

clean:
	rm -rf dist src-tauri/target
