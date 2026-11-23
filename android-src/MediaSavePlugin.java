package com.bdnir.scanner;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(name = "MediaSave")
public class MediaSavePlugin extends Plugin {

    private Uri tree() {
        String s = getContext().getSharedPreferences("scan", Context.MODE_PRIVATE).getString("root", null);
        return s == null ? null : Uri.parse(s);
    }

    private Uri doc(Uri tree, String id) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, id);
    }

    /** name -> "docId|mime" for children of a directory. */
    private Map<String, String[]> children(Uri tree, String parentId) {
        Map<String, String[]> m = new LinkedHashMap<>();
        Uri q = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (Cursor c = getContext().getContentResolver().query(q, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            while (c != null && c.moveToNext()) m.put(c.getString(1), new String[]{c.getString(0), c.getString(2)});
        } catch (Exception e) { }
        return m;
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getContext().getSharedPreferences("scan", Context.MODE_PRIVATE).edit().putString("root", uri.toString()).apply();
        getFolder(call);
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        JSObject o = new JSObject();
        Uri t = tree();
        String name = "";
        if (t != null) {
            try (Cursor c = getContext().getContentResolver().query(doc(t, DocumentsContract.getTreeDocumentId(t)),
                    new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception e) { }
        }
        o.put("name", name);
        call.resolve(o);
    }

    @PluginMethod
    public void folders(PluginCall call) {
        JSArray a = new JSArray();
        Uri t = tree();
        if (t != null) {
            for (Map.Entry<String, String[]> e : children(t, DocumentsContract.getTreeDocumentId(t)).entrySet())
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(e.getValue()[1])) a.put(e.getKey());
        }
        JSObject o = new JSObject();
        o.put("folders", a);
        call.resolve(o);
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            Uri t = tree();
            if (t == null) { call.reject("no main folder chosen"); return; }
            ContentResolver r = getContext().getContentResolver();
            String[] f = children(t, DocumentsContract.getTreeDocumentId(t)).get(call.getString("folder"));
            if (f == null) { call.reject("folder not found"); return; }
            Map<String, String[]> names = children(t, f[0]);
            String oldName = call.getString("name"), newName = call.getString("newName");
            String[] file = names.get(oldName);
            if (file == null) { call.reject("file not found"); return; }
            if (names.containsKey(newName)) { call.reject("exists"); return; }
            Uri res = DocumentsContract.renameDocument(r, doc(t, file[0]), newName);
            if (res == null) { call.reject("rename failed"); return; }
            JSObject o = new JSObject();
            o.put("name", newName);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            Uri t = tree();
            if (t == null) { call.reject("no main folder chosen"); return; }
            ContentResolver r = getContext().getContentResolver();
            String rootId = DocumentsContract.getTreeDocumentId(t);
            String folder = call.getString("folder"), name = call.getString("name");

            String[] f = children(t, rootId).get(folder);
            String folderId;
            if (f != null && DocumentsContract.Document.MIME_TYPE_DIR.equals(f[1])) folderId = f[0];
            else {
                Uri d = DocumentsContract.createDocument(r, doc(t, rootId), DocumentsContract.Document.MIME_TYPE_DIR, folder);
                if (d == null) { call.reject("could not create folder " + folder); return; }
                folderId = DocumentsContract.getDocumentId(d);
            }

            Map<String, String[]> names = children(t, folderId);
            int dot = name.lastIndexOf('.');
            String base = name.substring(0, dot), ext = name.substring(dot), finalName = name;
            for (int n = 2; names.containsKey(finalName); n++) finalName = base + "-" + n + ext;

            Uri file = DocumentsContract.createDocument(r, doc(t, folderId), call.getString("mime"), finalName);
            if (file == null) { call.reject("could not create file"); return; }
            try (OutputStream os = r.openOutputStream(file)) {
                os.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
            }
            JSObject o = new JSObject();
            o.put("name", finalName);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }
}
