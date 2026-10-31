import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, NotificationItem } from "../api";
import { dateAz } from "../format";

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
          <h1>Bildirişlər</h1>
          <div className="lead">
            Faktiki qiymət son təhlilin 90% aralığından çıxanda bildiriş yaranır. Bu, mövqeyə yenidən baxmaq üçün siqnaldır,
            avtomatik satış deyil.
          </div>
        </div>
        {items.some((n) => !n.read) && (
          <button onClick={async () => { await api.post("/api/notifications/read-all"); load(); }}>Hamısını oxunmuş et</button>
        )}
      </div>
      {items.length === 0 && <div className="card empty muted">Bildiriş yoxdur.</div>}
      {items.map((n) => (
        <div key={n.id} className={`banner ${n.read ? "info" : "warn"}`}>
          <span className="ic" aria-hidden="true">{n.read ? "•" : "⚠"}</span>
          <div style={{ flex: 1 }}>
            <div>{n.message}</div>
            <div className="small muted">
              {dateAz(n.created_at)} {n.portfolio_id && <Link to={`/portfolios/${n.portfolio_id}`}>portfelə keç</Link>}
            </div>
          </div>
          {!n.read && (
            <button onClick={async () => { await api.post(`/api/notifications/${n.id}/read`); load(); }}>Oxundu</button>
          )}
        </div>
      ))}
    </>
  );
}
