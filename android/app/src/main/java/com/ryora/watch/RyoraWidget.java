package com.ryora.watch;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Widget home-screen Ryora: tap → buka app.
 * Data (streak/hari ke-N) diisi lewat SharedPreferences "ryora_widget"
 * yang ditulis dari sisi web (lihat public/app.js → bridged via plugin nanti).
 */
public class RyoraWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences prefs = ctx.getSharedPreferences("ryora_widget", Context.MODE_PRIVATE);
        String line1 = prefs.getString("line1", "💓 Ryora");
        String line2 = prefs.getString("line2", "tap buat buka");
        for (int id : ids) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_ryora);
            views.setTextViewText(R.id.widget_line1, line1);
            views.setTextViewText(R.id.widget_line2, line2);
            Intent open = new Intent(ctx, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);
            mgr.updateAppWidget(id, views);
        }
    }
}
