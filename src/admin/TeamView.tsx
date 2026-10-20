export function TeamView() {
  return (
    <div className="admin-stack" id="team-view">
      <div className="admin-placeholder" role="status">
        <p className="admin-eyebrow">Accounts unavailable</p>
        <h3>Administrator accounts are not configured yet</h3>
        <p>
          Team membership, roles and account profiles require the persistent
          identity store, which is not enabled in this Access-mode workspace.
        </p>
        <ul>
          <li>No administrator members, invitations or roles are shown.</li>
          <li>No owner controls are available in this step.</li>
          <li>No account is created, edited or deactivated here.</li>
          <li>Access remains protected by the existing verified identity.</li>
        </ul>
      </div>
      <div className="admin-notice">
        <strong>Why this surface is empty</strong>
        <span>
          Showing placeholder people or roles would misrepresent who can access
          LaunchLoom. This view will be connected only after persistent accounts
          and membership verification are available.
        </span>
      </div>
    </div>
  );
}
