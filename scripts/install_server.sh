#!/usr/bin/bash

set -xe

prefix=$*

mkdir -p "${prefix}/lib/localweb"
cp -r server/localweb "${prefix}/lib/localweb"
cp -r server/templates "${prefix}/lib/localweb"
pip install -r server/requirements.txt --upgrade --target "${prefix}/lib/localweb"

cat << END_OF_INPUT > "${prefix}/bin/localweb-native-host"
#!/usr/bin/sh
cd ${prefix}/lib/localweb && python -m localweb.main native-host
END_OF_INPUT

cat << END_OF_INPUT > "${prefix}/bin/localweb-server"
#!/usr/bin/sh
cd ${prefix}/lib/localweb && python -m localweb.main serve
END_OF_INPUT

chmod +x "${prefix}/bin/localweb-native-host"
chmod +x "${prefix}/bin/localweb-server"
