/**
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

const bcrypt = require('bcrypt');
const path = require('path');
const settings = require('./settings');

if (!settings.adminAuth) {
  // No user-defined security
  let storage;
  if (settings.storageModule) {
    storage = settings.storageModule;
  } else {
    storage = require('node-red/red/runtime/storage/localfilesystem');
  }
  console.log('Loading application settings');
  storage
    .init(settings)
    .then(storage.getSettings)
    .then(runtimeSettings => {
      if (process.env.NODE_RED_USERNAME && process.env.NODE_RED_PASSWORD) {
        console.log(
          'Enabling adminAuth using NODE_RED_USERNAME/NODE_RED_PASSWORD'
        );
        const config = {
          adminAuth: {
            username: process.env.NODE_RED_USERNAME,
            password: bcrypt.hashSync(process.env.NODE_RED_PASSWORD, 8),
            allowAnonymous: process.env.NODE_RED_GUEST_ACCESS === 'true'
          }
        };

        if (
          runtimeSettings.bluemixConfig &&
          runtimeSettings.bluemixConfig.hasOwnProperty('adminAuth')
        ) {
          delete runtimeSettings.bluemixConfig.adminAuth;
          storage.saveSettings(runtimeSettings).then(() => {
            startNodeRED(config);
          });
        } else {
          startNodeRED(config);
        }
      } else if (runtimeSettings.bluemixConfig) {
        console.log('Using runtime settings for adminAuth');
        startNodeRED(runtimeSettings.bluemixConfig);
      } else {
        console.log('Starting first-use setup');
        let server;
        const express = require('express');
        const bodyParser = require('body-parser');
        const app = express();
        app.use(bodyParser.json());
        app.get('/', (req, res) => {
          res.sendFile(path.join(__dirname, 'public', 'first-run.html'));
        });
        app.post('/setup', (req, res) => {
          if (req.body.adminAuth && req.body.adminAuth.password) {
            req.body.adminAuth.password = bcrypt.hashSync(
              req.body.adminAuth.password,
              8
            );
          }
          runtimeSettings.bluemixConfig = req.body;
          console.log('Received first-use setup configuration');
          storage
            .saveSettings(runtimeSettings)
            .then(() => {
              res.status(200).end();
              setTimeout(() => {
                console.log('Stopping first-use setup application');
                server.shutdown(() => {
                  startNodeRED(req.body);
                });
              }, 1000);
            })
            .catch(err => {
              console.log('Failed to save configuration');
              console.log(err);
              res.status(200).end();
            });
        });
        app.use('/', express.static(path.join(__dirname, 'public')));
        const http = require('http');
        server = http.createServer((req, res) => {
          app(req, res);
        });
        server = require('http-shutdown')(server);
        server.listen(settings.uiPort, settings.uiHost, () => {});
        console.log('Waiting for first-use setup to complete');
      }
    })
    .catch(err => {
      console.log('Failed to initialise storage module');
      console.log(err);
    });
} else {
  startNodeRED({});
}

function startNodeRED(config) {
  if (config.adminAuth && !settings.adminAuth) {
    console.log(
      'Enabling adminAuth security - set NODE_RED_USERNAME and NODE_RED_PASSWORD to change credentials'
    );
    settings.adminAuth = {
      type: 'credentials',
      users: username =>
        config.adminAuth.username === username
          ? Promise.resolve({username: username, permissions: '*'})
          : Promise.resolve(null),
      authenticate: (username, password) =>
        config.adminAuth.username === username &&
        bcrypt.compareSync(password, config.adminAuth.password)
          ? Promise.resolve({username: username, permissions: '*'})
          : Promise.resolve(null)
    };
    if (
      process.env.NODE_RED_GUEST_ACCESS === 'true' ||
      (process.env.NODE_RED_GUEST_ACCESS === undefined &&
        config.adminAuth.allowAnonymous)
    ) {
      console.log(
        "Enabling anonymous read-only access - set NODE_RED_GUEST_ACCESS to 'false' to disable"
      );
      settings.adminAuth.default = () =>
        Promise.resolve({anonymous: true, permissions: 'read'});
    } else {
      console.log(
        "Disabled anonymous read-only access - set NODE_RED_GUEST_ACCESS to 'true' to enable"
      );
    }
  }
  if (config.useAppmetrics) {
    settings.useAppmetrics = config.useAppmetrics;
  }
  // ensure the environment variable overrides the settings
  if (
    process.env.NODE_RED_USE_APPMETRICS === 'true' ||
    (settings.useAppmetrics &&
      !(process.env.NODE_RED_USE_APPMETRICS === 'false'))
  ) {
    require('appmetrics-dash').attach();
  }
  require('node-red/red');
}
