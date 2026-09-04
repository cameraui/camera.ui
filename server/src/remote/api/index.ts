import { container } from 'tsyringe';

import { CloudCredentialStore } from './credentialStore.js';
import { OAuthRoute } from './routes/oauth.js';
import { ServerRoute } from './routes/server.js';
import { TrainRoute } from './routes/train.js';

export class CloudApi {
  public readonly oauthRoute: OAuthRoute;
  public readonly serverRoute: ServerRoute;
  public readonly trainRoute: TrainRoute;
  public readonly credentialStore: CloudCredentialStore;

  constructor() {
    container.registerInstance('cloudApi', this);

    this.credentialStore = new CloudCredentialStore();
    this.oauthRoute = new OAuthRoute(this.credentialStore);
    this.serverRoute = new ServerRoute(this.credentialStore);
    this.trainRoute = new TrainRoute(this.credentialStore);
  }
}
