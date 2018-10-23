/**
 * Copyright 2014, 2017 IBM Corp.
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

const nano = require('nano');
const fs = require('fs');
const path = require('path');

let settings;
let appname;
let flowDb;
let currentFlowRev;
let currentSettingsRev;
let currentCredRev;

const libraryCache = {};

function prepopulateFlows() {
  return new Promise(resolve => {
    const key = `${appname}/flow`;
    flowDb.get(key, err => {
      if (err) {
        const promises = [];
        if (fs.existsSync(`${__dirname}/defaults/flow.json`)) {
          try {
            const flow = fs.readFileSync(
              `${__dirname}/defaults/flow.json`,
              'utf8'
            );
            const flows = JSON.parse(flow);
            console.log('[couchstorage] Installing default flow');
            promises.push(couchstorage.saveFlows(flows));
          } catch (err2) {
            console.log('[couchstorage] Failed to save default flow');
            console.log(err2);
          }
        } else {
          console.log('[couchstorage] No default flow found');
        }
        if (fs.existsSync(`${__dirname}/defaults/flow_cred.json`)) {
          try {
            const cred = fs.readFileSync(
              `${__dirname}/defaults/flow_cred.json`,
              'utf8'
            );
            const creds = JSON.parse(cred);
            console.log('[couchstorage] Installing default credentials');
            promises.push(couchstorage.saveCredentials(creds));
          } catch (err2) {
            console.log('[couchstorage] Failed to save default credentials');
            console.log(err2);
          }
        } else {
          console.log('[couchstorage] No default credentials found');
        }
        // effectively a "settle"
        Promise.all(promises).then(() => resolve(), () => resolve());
      } else {
        // Flows already exist - leave them alone
        resolve();
      }
    });
  });
}

const couchstorage = {
  init: _settings => {
    settings = _settings;
    const couchDb = nano(settings.couchUrl);
    appname = settings.couchAppname || require('os').hostname();
    const dbname = settings.couchDb || 'nodered';

    return new Promise((resolve, reject) => {
      couchDb.db.get(dbname, (err, body) => {
        if (err) {
          couchDb.db.create(dbname, (err, body) => {
            if (err) {
              reject(new Error(`Failed to create database: ${err}`));
            } else {
              flowDb = couchDb.use(dbname);
              flowDb.insert(
                {
                  views: {
                    flow_entries_by_app_and_type: {
                      map: `function(doc) {
                          const p = doc._id.split('/');
                          if (p.length > 2 && p[2] == 'flow') {
                            const meta = {path: p.slice(3).join('/')};
                            emit([p[0], p[2]], meta);
                          }
                        }
                      `
                    },
                    lib_entries_by_app_and_type: {
                      map: `function(doc) {
                        const p = doc._id.split('/');
                        if (p.length > 2) {
                          if (p[2] != 'flow') {
                            const pathParts = p.slice(3, -1);
                            for (const i = 0; i < pathParts.length; i++) {
                              emit(
                                [p[0], p[2], pathParts.slice(0, i).join('/')],
                                {dir: pathParts.slice(i, i + 1)[0]}
                              );
                            }
                            const meta = {};
                            for (const key in doc.meta) {
                              meta[key] = doc.meta[key];
                            }
                            meta.fn = p.slice(-1)[0];
                            emit([p[0], p[2], pathParts.join('/')], meta);
                          }
                        }
                      }`
                    }
                  }
                },
                '_design/library',
                (err, b) => {
                  if (err) {
                    reject(new Error(`Failed to create view: ${err}`));
                  } else {
                    resolve();
                  }
                }
              );
            }
          });
        } else {
          flowDb = couchDb.use(dbname);
          resolve();
        }
      });
    }).then(prepopulateFlows);
  },

  getFlows: () => {
    const key = `${appname}/flow`;
    return new Promise((resolve, reject) => {
      flowDb.get(key, (err, doc) => {
        if (err) {
          if (err.statusCode !== 404) {
            reject(err);
          } else {
            resolve([]);
          }
        } else {
          currentFlowRev = doc._rev;
          resolve(doc.flow);
        }
      });
    });
  },

  saveFlows: flows => {
    const key = `${appname}/flow`;
    return new Promise((resolve, reject) => {
      const doc = {_id: key, flow: flows};
      if (currentFlowRev) {
        doc._rev = currentFlowRev;
      }
      flowDb.insert(doc, (err, db) => {
        if (err) {
          reject(err);
        } else {
          currentFlowRev = db.rev;
          resolve();
        }
      });
    });
  },

  getCredentials: () => {
    const key = `${appname}/credential`;
    return new Promise((resolve, reject) => {
      flowDb.get(key, (err, doc) => {
        if (err) {
          if (err.statusCode !== 404) {
            reject(err);
          } else {
            resolve({});
          }
        } else {
          currentCredRev = doc._rev;
          resolve(doc.credentials);
        }
      });
    });
  },

  saveCredentials: credentials => {
    const key = `${appname}/credential`;
    return new Promise((resolve, reject) => {
      const doc = {_id: key, credentials};
      if (currentCredRev) {
        doc._rev = currentCredRev;
      }
      flowDb.insert(doc, (err, db) => {
        if (err) {
          reject(err);
        } else {
          currentCredRev = db.rev;
          resolve();
        }
      });
    });
  },

  getSettings: () => {
    const key = `${appname}/settings`;
    return new Promise((resolve, reject) => {
      flowDb.get(key, (err, doc) => {
        if (err) {
          if (err.statusCode !== 404) {
            reject(err.toString());
          } else {
            resolve({});
          }
        } else {
          currentSettingsRev = doc._rev;
          resolve(doc.settings);
        }
      });
    });
  },

  saveSettings: settings => {
    const key = `${appname}/settings`;
    return new Promise((resolve, reject) => {
      const doc = {_id: key, settings};
      if (currentSettingsRev) {
        doc._rev = currentSettingsRev;
      }
      flowDb.insert(doc, (err, db) => {
        if (err) {
          reject(err);
        } else {
          currentSettingsRev = db.rev;
          resolve();
        }
      });
    });
  },

  getAllFlows: () => {
    const key = [appname, 'flow'];
    return new Promise((resolve, reject) => {
      flowDb.view(
        'library',
        'flow_entries_by_app_and_type',
        {key},
        (e, data) => {
          if (e) {
            reject(e);
          } else {
            const result = {};
            for (let i = 0; i < data.rows.length; i++) {
              const doc = data.rows[i];
              const path = doc.value.path;
              const parts = path.split('/');
              let ref = result;
              for (let j = 0; j < parts.length - 1; j++) {
                ref['d'] = ref['d'] || {};
                ref['d'][parts[j]] = ref['d'][parts[j]] || {};
                ref = ref['d'][parts[j]];
              }
              ref['f'] = ref['f'] || [];
              ref['f'].push(parts.slice(-1)[0]);
            }
            resolve(result);
          }
        }
      );
    });
  },

  getFlow: filepath => {
    filepath = path.resolve('/', filepath);
    const key = `${appname}/lib/flow${filepath}`;
    return new Promise((resolve, reject) => {
      flowDb.get(key, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.data);
        }
      });
    });
  },

  saveFlow: (filepath, data) => {
    filepath = path.resolve('/', filepath);
    const key = `${appname}/lib/flow${filepath}`;
    return new Promise((resolve, reject) => {
      const doc = {_id: key, data};
      flowDb.get(key, (err, d) => {
        if (err) {
          return reject(err);
        }
        if (d) {
          doc._rev = d._rev;
        }
        flowDb.insert(doc, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  },

  getLibraryEntry: (type, filepath) => {
    filepath = path.resolve('/', filepath);
    const key = `${appname}/lib/${type}${filepath}`;

    if (libraryCache[key]) {
      return Promise.resolve(libraryCache[key]);
    }

    return new Promise((resolve, reject) => {
      flowDb.get(key, (err, doc) => {
        if (err) {
          if (filepath.slice(-1) === '/') {
            filepath = filepath.slice(0, -1);
          }
          const qkey = [appname, type, filepath];
          flowDb.view(
            'library',
            'lib_entries_by_app_and_type',
            {key: qkey},
            (e, data) => {
              if (e) {
                reject(e);
              } else {
                const dirs = [];
                const files = [];
                data.rows.forEach(row => {
                  const value = row.value;

                  if (value.dir) {
                    if (dirs.indexOf(value.dir) === -1) {
                      dirs.push(value.dir);
                    }
                  } else {
                    files.push(value);
                  }
                });
                libraryCache[key] = dirs.concat(files);
                resolve(libraryCache[key]);
              }
            }
          );
        } else {
          libraryCache[key] = doc.body;
          resolve(doc.body);
        }
      });
    });
  },
  saveLibraryEntry: (type, filepath, meta, body) => {
    // strip multiple slash
    filepath = path.resolve(
      '/',
      filepath
        .split('/')
        .filter(Boolean)
        .join('/')
    );

    const key = `${appname}/lib/${type}${filepath}`;
    return new Promise((resolve, reject) => {
      const doc = {_id: key, meta, body};
      flowDb.get(key, (err, d) => {
        if (err) {
          return reject(err);
        }
        if (d) {
          doc._rev = d._rev;
        }
        flowDb.insert(doc, (err, d) => {
          if (err) {
            reject(err);
          } else {
            const p = filepath.split('/');
            for (let i = 0; i < p.length; i++) {
              delete libraryCache[
                `${appname}/lib/${type}${p.slice(0, i).join('/')}`
              ];
            }
            libraryCache[key] = body;
            resolve();
          }
        });
      });
    });
  }
};

module.exports = couchstorage;
