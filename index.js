/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

// Headless task for background uploads
AppRegistry.registerHeadlessTask('UploadTask', () => require('./src/UploadTask').default);
