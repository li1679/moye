package com.localediting.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(MoyeNativePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (MoyeNativePlugin.volumePaging && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                MoyeNativePlugin.emitVolume(code == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
