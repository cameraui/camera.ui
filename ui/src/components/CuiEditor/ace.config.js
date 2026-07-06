import ace from 'ace-builds';

import modeYamlUrl from 'ace-builds/src-noconflict/mode-yaml?url';
ace.config.setModuleUrl('ace/mode/yaml', modeYamlUrl);

import themeTwilightUrl from 'ace-builds/src-noconflict/theme-twilight?url';
ace.config.setModuleUrl('ace/theme/twilight', themeTwilightUrl);

import themeGithubUrl from 'ace-builds/src-noconflict/theme-github?url';
ace.config.setModuleUrl('ace/theme/github', themeGithubUrl);

import workerBaseUrl from 'ace-builds/src-noconflict/worker-base?url';
ace.config.setModuleUrl('ace/mode/base', workerBaseUrl);

import workerYamlUrl from 'ace-builds/src-noconflict/worker-yaml?url';
ace.config.setModuleUrl('ace/mode/yaml_worker', workerYamlUrl);

import 'ace-builds/src-noconflict/ext-language_tools';
ace.require('ace/ext/language_tools');
