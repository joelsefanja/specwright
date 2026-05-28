import React, { useState } from "react";

export interface AuthFields {
  userEmail: string;
  userName: string;
  userPicture: string;
  storageKey: string;
  signinPath: string;
  buttonTestId: string;
  postLoginUrl: string;
  password: string;
}

export const EMPTY_AUTH: AuthFields = {
  userEmail: "", userName: "", userPicture: "",
  storageKey: "", signinPath: "", buttonTestId: "", postLoginUrl: "",
  password: "",
};

export function isOAuthConfigured(f: AuthFields): boolean {
  return !!f.userEmail && !!(f.storageKey || f.buttonTestId);
}

export function isEmailPasswordConfigured(f: AuthFields): boolean {
  return !!f.userEmail && !!f.password;
}

export function AuthSettingsModal({
  strategy,
  initial,
  onSave,
  onClose,
}: {
  strategy: string;
  initial: AuthFields;
  onSave: (fields: AuthFields) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [fields, setFields] = useState<AuthFields>(initial);
  const set = (k: keyof AuthFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  const isOAuth = strategy === "oauth";
  const canSave = isOAuth ? isOAuthConfigured(fields) : isEmailPasswordConfigured(fields);

  const inputCls = (required: boolean, val: string) =>
    `operator-field w-full px-2 py-2 ${required && !val ? "border-[var(--sw-danger)]" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="operator-panel operator-modal-sm border shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-operator-line">
          <h2 className="text-stone-200 text-sm font-semibold">
            {isOAuth ? "OAuth" : "Email + Password"} Settings
          </h2>
          <button onClick={onClose} className="operator-muted hover:text-stone-300 text-xs">Close</button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div className="space-y-2">
            <p className="operator-section-title">User Identity</p>

            <div>
              <label className="operator-control-label">
                Email <span className="operator-danger">*</span>
              </label>
              <input
                type="text"
                value={fields.userEmail}
                onChange={set("userEmail")}
                placeholder="user@example.com"
                className={inputCls(true, fields.userEmail)}
              />
            </div>

            {isOAuth && (
              <>
                <div>
                  <label className="operator-control-label">
                    Display Name <span className="operator-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={fields.userName}
                    onChange={set("userName")}
                    placeholder="Derived from email if blank"
                    className={inputCls(false, fields.userName)}
                  />
                </div>

                <div>
                  <label className="operator-control-label">
                    Picture URL <span className="operator-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={fields.userPicture}
                    onChange={set("userPicture")}
                    placeholder="SVG initials auto-generated if blank"
                    className={inputCls(false, fields.userPicture)}
                  />
                </div>
              </>
            )}

            {!isOAuth && (
              <div>
                <label className="operator-control-label">
                  Password <span className="operator-danger">*</span>
                </label>
                <input
                  type="password"
                  value={fields.password}
                  onChange={set("password")}
                  placeholder="••••••••"
                  className={inputCls(true, fields.password)}
                />
              </div>
            )}
          </div>

          {isOAuth && (
            <div className="space-y-2">
              <p className="operator-section-title">
                Auth Mechanism <span className="operator-muted normal-case tracking-normal">(one required)</span>
              </p>

              <div>
                <label className="operator-control-label">
                  Storage Key
                  {!fields.buttonTestId && <span className="operator-danger"> *</span>}
                </label>
                <input
                  type="text"
                  value={fields.storageKey}
                  onChange={set("storageKey")}
                  placeholder="localStorage key (e.g. app-auth-user)"
                  className={inputCls(!fields.buttonTestId, fields.storageKey)}
                />
                <p className="operator-muted text-xs mt-1">Inject auth directly — no popup needed</p>
              </div>

              <div className="flex items-center gap-2">
                <hr className="flex-1 border-operator-line" />
                <span className="operator-muted text-xs">or</span>
                <hr className="flex-1 border-operator-line" />
              </div>

              <div>
                <label className="operator-control-label">
                  Sign-in Button Test ID
                  {!fields.storageKey && <span className="operator-danger"> *</span>}
                </label>
                <input
                  type="text"
                  value={fields.buttonTestId}
                  onChange={set("buttonTestId")}
                  placeholder="google-signin-button"
                  className={inputCls(!fields.storageKey, fields.buttonTestId)}
                />
              </div>

              <div>
                <label className="operator-control-label">
                  Sign-in Path <span className="operator-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={fields.signinPath}
                  onChange={set("signinPath")}
                  placeholder="/signin"
                  className={inputCls(false, fields.signinPath)}
                />
              </div>

              <div>
                <label className="operator-control-label">
                  Post-login URL <span className="operator-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={fields.postLoginUrl}
                  onChange={set("postLoginUrl")}
                  placeholder="**/"
                  className={inputCls(false, fields.postLoginUrl)}
                />
              </div>
            </div>
          )}

          {!canSave && (
            <p className="operator-danger text-xs">
              {isOAuth
                ? "Email and at least one auth mechanism (Storage Key or Button Test ID) are required."
                : "Email and password are required."}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-operator-line">
          <button
            onClick={onClose}
            className="operator-button"
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(fields)}
            disabled={!canSave}
            className="operator-button-primary disabled:opacity-40"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
