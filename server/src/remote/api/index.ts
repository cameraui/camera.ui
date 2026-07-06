import { container } from 'tsyringe';

import { CloudCredentialStore } from './credentialStore.js';
import { OAuthRoute } from './routes/oauth.js';
import { ServerRoute } from './routes/server.js';

export class CloudApi {
  public readonly oauthRoute: OAuthRoute;
  public readonly serverRoute: ServerRoute;
  public readonly credentialStore: CloudCredentialStore;

  constructor() {
    container.registerInstance('cloudApi', this);

    this.credentialStore = new CloudCredentialStore();
    this.oauthRoute = new OAuthRoute(this.credentialStore);
    this.serverRoute = new ServerRoute(this.credentialStore);
  }
}
