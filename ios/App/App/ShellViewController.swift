import UIKit
import Capacitor

/**
 * The app's one view controller: Capacitor's bridge, plus the plugins that
 * live in this project rather than in node_modules. Main.storyboard points
 * at this class instead of CAPBridgeViewController.
 *
 * `capacitorDidLoad` is the hook Capacitor gives for registering plugin
 * instances that are not auto-discovered packages.
 */
class ShellViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoipPlugin())
    }
}
