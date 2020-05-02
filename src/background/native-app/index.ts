import { MESSAGES } from '../../config';
import {
  IPywalColors,
  INativeAppMessage,
  INativeAppMessageCallbacks
} from '../../definitions';

/* Interface for the messages sent to the native messaging host. */
interface INativeAppRequest {
  action: string;
  target?: string;
}

/**
 * Implements the communcation with the native messaging host.
 *
 * @remarks
 * Based on the native messaging protocol, allowing extensions to communicate with
 * user's computer and share resources that are otherwise inaccessible by the browser.
 * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
 *
 * @param callbacks - the callbacks to be used when a message is received
 */
export class NativeApp {
  private port: browser.runtime.Port;
  private isConnected: boolean;
  private callbacks: INativeAppMessageCallbacks;

  private versionCheckTimeout: number;
  private connectedCheckTimeout: number;

  constructor(callbacks: INativeAppMessageCallbacks) {
    this.callbacks = callbacks;
  }

  private logError(error: string) {
    this.callbacks.output(error, true);
  }

  private getData(message: INativeAppMessage) {
    if (message.hasOwnProperty('data')) {
      return message.data;
    }

    this.logError(`Recieved invalid message from native app. The 'data' field is undefined.`);
    return false;
  }

  private handleCssToggleResponse(message: INativeAppMessage, enabled: boolean) {
    const target = this.getData(message);
    const error = message['error'];

    if (!target) {
      this.logError(`Custom CSS was applied successfully, but no target was specified`);
      return;
    }

    if (message.success) {
      this.callbacks.cssToggleSuccess(target);
    } else {
      this.callbacks.cssToggleFailed(target, error);
    }
  }

  private async onMessage(message: INativeAppMessage) {
    console.debug(message);
    switch(message.action) {
      case MESSAGES.VERSION:
        const version = this.getData(message);
        if (version) {
          this.callbacks.version(version);
        } else {
          this.callbacks.updateNeeded();
        }
        clearTimeout(this.versionCheckTimeout);
        break;
      case MESSAGES.OUTPUT:
        const output = this.getData(message);
        if (output) {
          this.callbacks.output(output);
        }
        break;
      case MESSAGES.COLORSCHEME:
        const colorscheme = this.getData(message);
        if (colorscheme) {
          this.callbacks.colorscheme(colorscheme);
        }
        break;
      case MESSAGES.CSS_ENABLE:
        this.handleCssToggleResponse(message, true);
        break;
      case MESSAGES.CSS_DISABLE:
        this.handleCssToggleResponse(message, false);
        break;
      case MESSAGES.INVALID_ACTION:
        this.logError(`Native app recieved unhandled message action: ${message.action}`);
        break;
      default:
        this.logError(`Received unhandled message action: ${message.action}`);
        break;
    }
  }

  private async onDisconnect(port: browser.runtime.Port) {
    if (port.error) {
      clearTimeout(this.versionCheckTimeout);
      clearTimeout(this.connectedCheckTimeout);
      this.callbacks.disconnected();
      console.log('Disconnected from native messaging host');
    }
  }

  private setupListeners() {
    this.port.onMessage.addListener(this.onMessage.bind(this));
    this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
  }

  public async connect() {
    this.port = await browser.runtime.connectNative('pywalfox');
    this.isConnected = true;
    this.versionCheckTimeout = window.setTimeout(this.callbacks.updateNeeded, 1000);
    this.connectedCheckTimeout = window.setTimeout(this.callbacks.connected, 1000);
    this.setupListeners();
    this.requestVersion();
  }

  private sendMessage(message: INativeAppRequest) {
    this.port.postMessage(message);
  }

  public requestVersion() {
    this.sendMessage({ action: MESSAGES.VERSION });
  }

  public requestColorscheme() {
    this.sendMessage({ action: MESSAGES.COLORSCHEME });
  }

  public requestCssEnabled(target: string, enabled: boolean) {
    this.sendMessage({ action: enabled ? MESSAGES.CSS_ENABLE : MESSAGES.CSS_DISABLE, target });
  }
}
