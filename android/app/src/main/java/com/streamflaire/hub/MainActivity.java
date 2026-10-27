package com.streamflaire.hub;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this project (not in node_modules) register before the bridge loads.
        registerPlugin(TapToPayPlugin.class);
        registerPlugin(SpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
