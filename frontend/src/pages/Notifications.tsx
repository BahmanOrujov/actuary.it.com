import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, NotificationItem } from "../api";
import { dateAz } from "../format";
import { L } from "../lang";
import { t } from "../i18n";

export default function NotificationsPage({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const load = () =>
    api.get<{ unread: number; items: NotificationItem[] }>("/api/notifications").then((r) => {
      setItems(r.items);
      onChange();
    });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("notifications")}</h1>
          <div className="lead">
            {L("Faktiki qiymət son təhlilin 90% aralığından çıxanda bildiriş yaranır. Bu, mövqeyə yenidən baxmaq üçün siqnaldır, avtomatik satış deyil.",
              "A notification appears when the actual price leaves the 90% range of the latest analysis. It is a signal to review the position, not an automatic sale.")}
          </div>
        </div>
        {items.some((n) => !n.read) && (
          <button onClick={async () => { await api.post("/api/notifications/read-all"); load(); }}>{L("Hamısını oxunmuş et", "Mark all as read")}</button>
        )}
      </div>
      {items.length === 0 && <div className="card empty muted">{L("Bildiriş yoxdur.", "No notifications.")}</div>}
      {items.map((n) => (
        <div key={n.id} className={`banner ${n.read ? "info" : "warn"}`}>
          <span className="ic" aria-hidden="true">{n.read ? "•" : "⚠"}</span>
          <div style={{ flex: 1 }}>
            <div>{n.message}</div>
            <div className="small muted">
              {dateAz(n.created_at)} {n.portfolio_id && <Link to={`/portfolios/${n.portfolio_id}`}>{L("portfelə keç", "open the portfolio")}</Link>}
            </div>
          </div>
          {!n.read && (
            <button onClick={async () => { await api.post(`/api/notifications/${n.id}/read`); load(); }}>{L("Oxundu", "Read")}</button>
          )}
        </div>
      ))}
    </>
  );
}
