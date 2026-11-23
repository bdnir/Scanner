package com.bdnir.scanner;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.Set;
import java.util.TreeSet;

@CapacitorPlugin(name = "MediaSave")
public class MediaSavePlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        try {
            String name = call.getString("name");
            ContentResolver r = getContext().getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, call.getString("mime"));
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/Scans/" + call.getString("folder"));
            Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) { call.reject("insert failed"); return; }
            try (OutputStream os = r.openOutputStream(uri)) {
                os.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
            }
            Cursor c = r.query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
            if (c != null) { if (c.moveToFirst()) name = c.getString(0); c.close(); }
            JSObject o = new JSObject();
            o.put("name", name);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void folders(PluginCall call) {
        Set<String> set = new TreeSet<>();
        try {
            Cursor c = getContext().getContentResolver().query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.MediaColumns.RELATIVE_PATH},
                MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?",
                new String[]{"Download/Scans/%"}, null);
            if (c != null) {
                while (c.moveToNext()) {
                    String[] parts = c.getString(0).split("/");
                    if (parts.length > 2) set.add(parts[2]);
                }
                c.close();
            }
        } catch (Exception e) { }
        JSArray a = new JSArray();
        for (String s : set) a.put(s);
        JSObject o = new JSObject();
        o.put("folders", a);
        call.resolve(o);
    }
}
