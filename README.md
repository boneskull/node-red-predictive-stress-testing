# Predictive Market Stress Testing with Node-RED

Essentially a re-implementation of [predictive market stress testing](https://github.com/ibm/predictive-market-stress-testing), except uses Node-RED with [node-red-contrib-ibm-fintech](https://npm.im/node-red-contrib-ibm-fintech) for the backend, instead of Python.

## IBM Cloud installation

[![Deploy to IBM Cloud](https://bluemix.net/deploy/button.png)](https://bluemix.net/devops/setup/deploy?repository=https://github.com/boneskull/node-red-predictive-stress-testing.git)

## Local installation

1. Clone repo
1. Execute `npm install` in working copy
1. Execute `npm start`
1. Open http://localhost:1880/first-run.html and complete the wizard.  Easiest to choose "no authentication"
1. Navigate to https://localhost:1880/red/
1. You'll need to add your credentials for the three fintech services to the configuration Nodes.
1. Deploy.
1. Navigate to https://localhost:1880/ and complete the form for predictive market stress testing goodness

## Maintainer

- [Christopher Hiller](https://github.com/boneskull)

## License

© 2018 IBM. Licensed Apache-2.0
