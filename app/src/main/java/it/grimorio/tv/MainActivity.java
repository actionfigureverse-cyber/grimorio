package it.grimorio.tv;

import android.app.Activity;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 11, 16));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("file:")) return false;
                openUrl(url, null);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        web.requestFocus(View.FOCUS_DOWN);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (k == KeyEvent.KEYCODE_BACK || k == KeyEvent.KEYCODE_ESCAPE) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.tvBack ? String(window.tvBack()) : 'false'", value -> {
                    if (!"\"true\"".equals(value) && !"true".equals(value)) finish();
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("(function(){var v=document.getElementById('vid'); if(v&&!v.paused) v.pause();})()", null);
    }

    /** Cerca tra le app installate quella con questo nome (es. "RaiPlay"). */
    private String findPackage(String appName) {
        if (appName == null || appName.isEmpty()) return null;
        String want = norm(appName);
        PackageManager pm = getPackageManager();
        List<ResolveInfo> all = new ArrayList<>();
        Intent tv = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        Intent ph = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        all.addAll(pm.queryIntentActivities(tv, 0));
        all.addAll(pm.queryIntentActivities(ph, 0));
        for (ResolveInfo ri : all) {
            String label = norm(String.valueOf(ri.loadLabel(pm)));
            if (ri.activityInfo.packageName.equals(getPackageName())) continue;
            if (label.contains(want) || want.contains(label) && label.length() > 3) return ri.activityInfo.packageName;
        }
        return null;
    }

    private static String norm(String s) {
        return s.toLowerCase(Locale.ITALIAN).replaceAll("[^a-z0-9]", "");
    }

    private Intent launchIntent(String pkg) {
        PackageManager pm = getPackageManager();
        Intent i = null;
        if (Build.VERSION.SDK_INT >= 21) i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        return i;
    }

    private boolean start(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException ex) {
            return false;
        }
    }

    /** Apre url (nell'app indicata se c'è), altrimenti l'app, altrimenti il browser. */
    private String openUrl(String url, String appName) {
        String pkg = findPackage(appName);
        if (pkg != null) {
            if (url != null && !url.isEmpty()) {
                Intent v = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(pkg);
                if (!getPackageManager().queryIntentActivities(v, 0).isEmpty() && start(v)) return "ok";
            }
            Intent l = launchIntent(pkg);
            if (l != null && start(l)) return "app";
        }
        if (url != null && !url.isEmpty() && start(new Intent(Intent.ACTION_VIEW, Uri.parse(url)))) return "web";
        return "none";
    }

    class Bridge {
        @JavascriptInterface
        public String open(final String url, final String app, final String query) {
            final String[] res = {null};
            final Object lock = new Object();
            runOnUiThread(() -> {
                String r;
                String pkg = findPackage(app);
                if (pkg != null && query != null && !query.isEmpty()) {
                    // prima prova la ricerca interna dell'app, poi il link, poi l'app
                    Intent s = new Intent(Intent.ACTION_SEARCH).setPackage(pkg).putExtra(SearchManager.QUERY, query);
                    if (!getPackageManager().queryIntentActivities(s, 0).isEmpty() && start(s)) r = "search";
                    else r = openUrl(url, app);
                } else {
                    r = openUrl(url, app);
                }
                synchronized (lock) { res[0] = r; lock.notify(); }
            });
            synchronized (lock) {
                long end = System.currentTimeMillis() + 4000;
                while (res[0] == null && System.currentTimeMillis() < end) {
                    try { lock.wait(200); } catch (InterruptedException ignored) { break; }
                }
            }
            return res[0] == null ? "app" : res[0];
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
