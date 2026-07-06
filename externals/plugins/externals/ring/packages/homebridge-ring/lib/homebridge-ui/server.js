/* eslint-disable no-console */
import { HomebridgePluginUiServer, RequestError, } from '@homebridge/plugin-ui-utils';
import { RingRestClient } from 'ring-client-api/rest-client';
import { controlCenterDisplayName, getSystemId } from "../config.js";
class PluginUiServer extends HomebridgePluginUiServer {
    restClient;
    constructor() {
        super();
        this.onRequest('/send-code', this.generateCode);
        this.onRequest('/token', this.generateToken);
        this.ready();
    }
    generateCode = async ({ email, password }) => {
        console.log(`Logging in with email '${email}'`);
        const storagePath = this.homebridgeStoragePath;
        this.restClient = new RingRestClient({
            email,
            password,
            controlCenterDisplayName,
            systemId: storagePath ? getSystemId(storagePath) : undefined,
        });
        try {
            const { refresh_token } = await this.restClient.getCurrentAuth();
            // If we get here, 2fa was not required.  I'm not sure this is possible anymore, but it's here just in case
            return { refreshToken: refresh_token };
        }
        catch (e) {
            if (this.restClient.promptFor2fa) {
                console.log(this.restClient.promptFor2fa);
                return { codePrompt: this.restClient.promptFor2fa };
            }
            console.error(e);
            throw new RequestError(e.message, e);
        }
    };
    generateToken = async ({ email, password, code }) => {
        // use the existing restClient to avoid sending a token again
        this.restClient = this.restClient || new RingRestClient({ email, password });
        console.log(`Getting token for ${email} with code ${code}`);
        try {
            const authResponse = await this.restClient.getAuth(code);
            return { refreshToken: authResponse.refresh_token };
        }
        catch (e) {
            console.error('Incorrect 2fa Code');
            throw new RequestError('Please check the code and try again', e);
        }
    };
}
function startPluginUiServer() {
    return new PluginUiServer();
}
startPluginUiServer();
