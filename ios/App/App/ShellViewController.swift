import UIKit
import Capacitor

/**
 * The app's one view controller: Capacitor's bridge, plus the plugins that
 * live in this project rather than in node_modules. Main.storyboard points
 * at this class instead of CAPBridgeViewController.
 *
 * `capacitorDidLoad` is the hook Capacitor gives for registering plugin
 * instances that are not auto-discovered packages.
 *
 * `instanceDescriptor` lets a build point the shell at another origin:
 * Info.plist `WBShellOrigin` comes from the `WB_SHELL_ORIGIN` build setting
 * (Debug = the staging site, for the Square sandbox Tap to Pay test build;
 * Release = empty = capacitor.config's production URL). The origin must also
 * be in Info.plist `WKAppBoundDomains`, or the bridge cannot inject itself.
 */
class ShellViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoipPlugin())
        bridge?.registerPluginInstance(TapToPayPlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
    }

    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let origin = Bundle.main.object(forInfoDictionaryKey: "WBShellOrigin") as? String,
           !origin.isEmpty,
           let url = URL(string: origin.hasSuffix("/") ? String(origin.dropLast()) + "/app/dashboard" : origin + "/app/dashboard"),
           let host = url.host {
            descriptor.serverURL = url.absoluteString
            descriptor.allowedNavigationHostnames = [host]
        }
        return descriptor
    }
}
