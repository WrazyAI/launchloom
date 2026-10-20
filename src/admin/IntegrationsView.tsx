export function IntegrationsView() {
  return (
    <div className="admin-integration" role="status" id="integrations-view">
      <div className="admin-integration__head">
        <div>
          <p className="admin-eyebrow">GoHighLevel</p>
          <h3>Contact matching and generation milestones</h3>
        </div>
        <span className="admin-status-pill">Not connected</span>
      </div>
      <p>
        A future integration will describe contact matching and generation
        milestones. It is not connected today, and this workspace makes no
        third-party requests.
      </p>
      <button type="button" disabled>
        Connection coming later
      </button>
      <p className="admin-muted">
        Status: <strong>Planned</strong>. No credentials, OAuth flow, sync
        timestamps or provider actions are present.
      </p>
    </div>
  );
}
