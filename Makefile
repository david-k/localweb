WEB_EXTENSION_BUILD_DIR = "build/web_extension"

.PHONY: build install

build:
	cd web_extension/ && npx esbuild --bundle --sourcemap popup/main.ts --outfile=../${WEB_EXTENSION_BUILD_DIR}/popup/main.js
	cp -u web_extension/manifest.json ${WEB_EXTENSION_BUILD_DIR}
	cp -u web_extension/popup/index.html ${WEB_EXTENSION_BUILD_DIR}/popup/index.html
	cp -ur web_extension/content ${WEB_EXTENSION_BUILD_DIR}
	cp -ur web_extension/assets ${WEB_EXTENSION_BUILD_DIR}
	cp -ur web_extension/vendor ${WEB_EXTENSION_BUILD_DIR}

install:
	python install.py
