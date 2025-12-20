prefix = ~/.local
build_dir = ./build
web_extension_build_dir = ${build_dir}/web_extension

.PHONY: default web-extension localweb-server run-dev-server install

default: web-extension

web-extension:
	cd web_extension/ && npx esbuild --bundle --sourcemap popup/main.ts --outfile=../${web_extension_build_dir}/popup/main.js
	cp -u web_extension/manifest.json ${web_extension_build_dir}
	cp -u web_extension/popup/index.html ${web_extension_build_dir}/popup/index.html
	cp -ur web_extension/content ${web_extension_build_dir}
	cp -ur web_extension/assets ${web_extension_build_dir}
	cp -ur web_extension/vendor ${web_extension_build_dir}

localweb-server:
	rm -rf "${build_dir}/localweb-server-files"
	mkdir "${build_dir}/localweb-server-files"
	cp -r server/localweb "${build_dir}/localweb-server-files/localweb"
	source server/venv/bin/activate && pip install -r server/requirements.txt --target "${build_dir}/localweb-server-files"
	python -m zipapp "${build_dir}/localweb-server-files" --main localweb.main:main -p "/usr/bin/env python3" -o "${build_dir}/localweb-server"

run-dev-server: server/venv
	cd server && source venv/bin/activate && python -m localweb.main serve

# Installs the following components:
# - localweb-server
# - localweb-native-host
# - configuration files for the browser so the browser extension can talk to
#   localweb-native-host
install:
	./scripts/install_server.sh ${prefix}

	python scripts/install_native_host_config.py \
		server/localweb_companion.template.json \
		${prefix}/bin/localweb-native-host

	python scripts/install_native_host_config.py \
		server/singlefile_companion.template.json \
		${prefix}/bin/localweb-native-host

server/venv:
	python -m venv server/venv
	source server/venv/bin/activate && pip install -r server/requirements.txt
