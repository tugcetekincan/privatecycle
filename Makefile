# PrivateCycle - Expo React Native Project Makefile
# =================================================

.PHONY: help install dev clean build android ios web lint test doctor setup reset release prebuild

# Default target
.DEFAULT_GOAL := help

# Variables
PROJECT_NAME := PrivateCycle
ANDROID_SDK := $(HOME)/Library/Android/sdk
NODE_ENV := development

# Colors for output
YELLOW := \033[33m
GREEN := \033[32m
RED := \033[31m
BLUE := \033[34m
NC := \033[0m # No Color

## help: Show this help message
help:
	@echo "$(BLUE)$(PROJECT_NAME) - Development Commands$(NC)"
	@echo "=================================="
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make dev          - Start development server"
	@echo "  make dev-clear    - Start dev server with cleared cache"
	@echo "  make dev-tunnel   - Start dev server with tunnel"
	@echo "  make install      - Install dependencies"
	@echo "  make clean        - Clean node_modules and reinstall"
	@echo ""
	@echo "$(YELLOW)Building:$(NC)"
	@echo "  make android      - Build Android APK locally"
	@echo "  make android-eas  - Build Android APK with EAS (cloud)"
	@echo "  make ios          - Run iOS simulator"
	@echo "  make web          - Build for web"
	@echo "  make prebuild     - Generate native code"
	@echo ""
	@echo "$(YELLOW)Quality & Testing:$(NC)"
	@echo "  make lint         - Run linter"
	@echo "  make doctor       - Run Expo doctor"
	@echo "  make type-check   - Run TypeScript type checking"
	@echo ""
	@echo "$(YELLOW)Environment:$(NC)"
	@echo "  make setup        - Initial project setup"
	@echo "  make reset        - Reset project (clean + prebuild)"
	@echo "  make env-check    - Check environment setup"
	@echo ""
	@echo "$(YELLOW)Release:$(NC)"
	@echo "  make release-android - Build signed Android release"
	@echo "  make release-preview - Build preview release"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make logs         - View Expo logs"
	@echo "  make simulator    - Open iOS simulator"
	@echo "  make emulator     - Start Android emulator"

## install: Install project dependencies
install:
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

## dev: Start development server
dev:
	@echo "$(GREEN)Starting development server...$(NC)"
	EXPO_NO_TELEMETRY=1 npx expo start

## dev-clear: Start development server with cleared cache
dev-clear:
	@echo "$(GREEN)Starting development server with cleared cache...$(NC)"
	EXPO_NO_TELEMETRY=1 npx expo start --clear

## dev-tunnel: Start development server with tunnel
dev-tunnel:
	@echo "$(GREEN)Starting development server with tunnel...$(NC)"
	EXPO_NO_TELEMETRY=1 npx expo start --tunnel

## clean: Clean node_modules and reinstall dependencies
clean:
	@echo "$(YELLOW)Cleaning project...$(NC)"
	rm -rf node_modules
	rm -f package-lock.json
	npm install
	@echo "$(GREEN)Project cleaned and dependencies reinstalled!$(NC)"

## prebuild: Generate native Android/iOS code
prebuild:
	@echo "$(GREEN)Generating native code...$(NC)"
	npx expo prebuild --platform android --clean
	@echo "$(GREEN)Native code generated successfully!$(NC)"

## android: Build Android APK locally
android: env-check prebuild
	@echo "$(GREEN)Building Android APK locally...$(NC)"
	@export ANDROID_HOME=$(ANDROID_SDK) && \
	export PATH=$$PATH:$$ANDROID_HOME/platform-tools && \
	cd android && \
	./gradlew assembleRelease
	@cp android/app/build/outputs/apk/release/app-release.apk ./$(PROJECT_NAME).apk
	@echo "$(GREEN)Android APK built successfully: $(PROJECT_NAME).apk$(NC)"

## android-eas: Build Android APK with EAS (cloud)
android-eas:
	@echo "$(GREEN)Building Android APK with EAS...$(NC)"
	npx eas build --platform android --profile preview

## ios: Run iOS simulator
ios:
	@echo "$(GREEN)Starting iOS simulator...$(NC)"
	npx expo run:ios

## web: Build for web
web:
	@echo "$(GREEN)Building for web...$(NC)"
	npx expo export --platform web
	@echo "$(GREEN)Web build completed in dist/ directory$(NC)"

## lint: Run linter
lint:
	@echo "$(GREEN)Running linter...$(NC)"
	npx expo lint

## type-check: Run TypeScript type checking
type-check:
	@echo "$(GREEN)Running TypeScript type check...$(NC)"
	npx tsc --noEmit

## doctor: Run Expo doctor to check project health
doctor:
	@echo "$(GREEN)Running Expo doctor...$(NC)"
	npx expo doctor

## setup: Initial project setup
setup: install env-check
	@echo "$(GREEN)Setting up project...$(NC)"
	@echo "$(YELLOW)Checking Expo CLI...$(NC)"
	@which expo > /dev/null || (echo "Installing Expo CLI..." && npm install -g @expo/cli)
	@echo "$(GREEN)Project setup completed!$(NC)"

## reset: Reset project (clean everything and rebuild)
reset: clean
	@echo "$(YELLOW)Resetting project...$(NC)"
	rm -rf android ios .expo
	rm -f expo-env.d.ts
	npx expo prebuild --platform android --clean
	@echo "$(GREEN)Project reset completed!$(NC)"

## env-check: Check if required tools are installed
env-check:
	@echo "$(GREEN)Checking environment...$(NC)"
	@echo "Node.js version: $$(node --version)"
	@echo "npm version: $$(npm --version)"
	@which expo > /dev/null && echo "Expo CLI: ✓" || echo "$(RED)Expo CLI: ✗ (run: npm install -g @expo/cli)$(NC)"
	@test -d "$(ANDROID_SDK)" && echo "Android SDK: ✓" || echo "$(RED)Android SDK: ✗ (install Android Studio)$(NC)"
	@which java > /dev/null && echo "Java: ✓" || echo "$(RED)Java: ✗ (install JDK)$(NC)"

## release-android: Build signed Android release
release-android:
	@echo "$(GREEN)Building signed Android release...$(NC)"
	npx eas build --platform android --profile production

## release-preview: Build preview release for testing
release-preview:
	@echo "$(GREEN)Building preview release...$(NC)"
	npx eas build --platform android --profile preview --local

## logs: View Expo development logs
logs:
	@echo "$(GREEN)Viewing Expo logs...$(NC)"
	npx expo logs

## simulator: Open iOS simulator
simulator:
	@echo "$(GREEN)Opening iOS simulator...$(NC)"
	open -a Simulator

## emulator: Start Android emulator
emulator:
	@echo "$(GREEN)Starting Android emulator...$(NC)"
	@export ANDROID_HOME=$(ANDROID_SDK) && \
	$$ANDROID_HOME/emulator/emulator -list-avds | head -1 | xargs -I {} $$ANDROID_HOME/emulator/emulator -avd {} &

## test: Run tests (when implemented)
test:
	@echo "$(GREEN)Running tests...$(NC)"
	@echo "$(YELLOW)No tests configured yet. Add your test command here.$(NC)"

# Development workflow shortcuts
## quick-start: Quick development start (install + dev)
quick-start: install dev

## build-all: Build for all platforms
build-all: web android

## check-all: Run all quality checks
check-all: lint type-check doctor

# Maintenance commands
## update-deps: Update all dependencies
update-deps:
	@echo "$(GREEN)Updating dependencies...$(NC)"
	npm update
	npx expo upgrade

## clean-builds: Clean all build artifacts
clean-builds:
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf android/app/build
	rm -rf android/.gradle
	rm -rf dist
	rm -f *.apk
	@echo "$(GREEN)Build artifacts cleaned!$(NC)"

## status: Show project status
status:
	@echo "$(BLUE)Project Status$(NC)"
	@echo "=============="
	@echo "Project: $(PROJECT_NAME)"
	@echo "Directory: $$(pwd)"
	@echo "Git branch: $$(git branch --show-current 2>/dev/null || echo 'Not a git repo')"
	@echo "Git status: $$(git status --porcelain 2>/dev/null | wc -l | xargs echo) files changed"
	@echo "Dependencies: $$(ls node_modules 2>/dev/null | wc -l | xargs echo) packages"
	@echo "APK exists: $$(test -f $(PROJECT_NAME).apk && echo 'Yes' || echo 'No')"
