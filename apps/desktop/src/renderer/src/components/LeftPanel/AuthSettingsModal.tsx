import React, { useState } from "react";
import { useTranslations } from "@renderer/i18n/localeStore";
import { Key } from "@phosphor-icons/react";
import { ModalShell } from "../ui";

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
  const text = useTranslations().configureAccess.authModal;
  const [fields, setFields] = useState<AuthFields>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<keyof AuthFields>>(new Set());
  const set = (k: keyof AuthFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));
  const touch = (k: keyof AuthFields) => () =>
    setTouched((current) => new Set(current).add(k));

  const isOAuth = strategy === "oauth";
  const canSave = isOAuth ? isOAuthConfigured(fields) : isEmailPasswordConfigured(fields);

  const inputCls = (required: boolean, val: string, key: keyof AuthFields) =>
    `operator-field w-full px-2 py-2 ${required && !val && (submitted || touched.has(key)) ? "border-[var(--sw-danger)]" : ""}`;

  const footer = (
    <>
      <button type="button" onClick={onClose} className="operator-button">
        {text.cancel}
      </button>
      <button
        type="button"
        onClick={() => {
          setSubmitted(true);
          if (canSave) onSave(fields);
        }}
        disabled={!canSave}
        className="operator-button-primary disabled:opacity-40"
      >
        {text.save}
      </button>
    </>
  );

  return (
    <ModalShell
      title={text.modalTitle}
      description={text.intro}
      icon={<Key size={18} weight="duotone" />}
      size="md"
      closeLabel={text.close}
      footer={footer}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
          <div className="operator-auth-context-card">
            <div>
              <p className="operator-auth-context-label">{text.userIdentity}</p>
              <strong>{fields.userEmail || text.notFilledIn}</strong>
            </div>
            <p>{text.requiredHelp}</p>
          </div>

          <div className="space-y-2">
            <p className="operator-section-title">{text.userIdentity}</p>

            <div>
              <label className="operator-control-label">
                {text.email} <span className="operator-danger">*</span>
              </label>
              <input
                type="email"
                value={fields.userEmail}
                onChange={set("userEmail")}
                onBlur={touch("userEmail")}
                placeholder="user@example.com"
                className={inputCls(true, fields.userEmail, "userEmail")}
              />
            </div>

            {isOAuth && (
              <>
                <div>
                  <label className="operator-control-label">
                    {text.displayName} <span className="operator-muted">({text.optional})</span>
                  </label>
                  <input
                    type="text"
                    value={fields.userName}
                    onChange={set("userName")}
                    onBlur={touch("userName")}
                    placeholder={text.displayNamePlaceholder}
                    className={inputCls(false, fields.userName, "userName")}
                  />
                </div>

                <div>
                  <label className="operator-control-label">
                    {text.pictureUrl} <span className="operator-muted">({text.optional})</span>
                  </label>
                  <input
                    type="text"
                    value={fields.userPicture}
                    onChange={set("userPicture")}
                    onBlur={touch("userPicture")}
                    placeholder={text.picturePlaceholder}
                    className={inputCls(false, fields.userPicture, "userPicture")}
                  />
                </div>
              </>
            )}

            {!isOAuth && (
              <div>
                <label className="operator-control-label">
                  {text.password} <span className="operator-danger">*</span>
                </label>
                <input
                  type="password"
                  value={fields.password}
                  onChange={set("password")}
                  onBlur={touch("password")}
                  placeholder="••••••••"
                  className={inputCls(true, fields.password, "password")}
                />
              </div>
            )}
          </div>

          {isOAuth && (
            <div className="space-y-2">
              <p className="operator-section-title">
                {text.authMechanism} <span className="operator-muted normal-case tracking-normal">({text.oneRequired})</span>
              </p>

              <div>
                <label className="operator-control-label">
                  {text.storageKey}
                  {!fields.buttonTestId && <span className="operator-danger"> *</span>}
                </label>
                <input
                  type="text"
                  value={fields.storageKey}
                  onChange={set("storageKey")}
                  onBlur={touch("storageKey")}
                  placeholder={text.storagePlaceholder}
                  className={inputCls(!fields.buttonTestId, fields.storageKey, "storageKey")}
                />
                <p className="operator-muted text-xs mt-1">{text.storageHelp}</p>
              </div>

              <div className="flex items-center gap-2">
                <hr className="flex-1 border-operator-line" />
                <span className="operator-muted text-xs">{text.or}</span>
                <hr className="flex-1 border-operator-line" />
              </div>

              <div>
                <label className="operator-control-label">
                  {text.buttonTestId}
                  {!fields.storageKey && <span className="operator-danger"> *</span>}
                </label>
                <input
                  type="text"
                  value={fields.buttonTestId}
                  onChange={set("buttonTestId")}
                  onBlur={touch("buttonTestId")}
                  placeholder="google-signin-button"
                  className={inputCls(!fields.storageKey, fields.buttonTestId, "buttonTestId")}
                />
              </div>

              <div>
                <label className="operator-control-label">
                  {text.signInPath} <span className="operator-muted">({text.optional})</span>
                </label>
                <input
                  type="text"
                  value={fields.signinPath}
                  onChange={set("signinPath")}
                  onBlur={touch("signinPath")}
                  placeholder="/signin"
                  className={inputCls(false, fields.signinPath, "signinPath")}
                />
              </div>

              <div>
                <label className="operator-control-label">
                  {text.postLoginUrl} <span className="operator-muted">({text.optional})</span>
                </label>
                <input
                  type="text"
                  value={fields.postLoginUrl}
                  onChange={set("postLoginUrl")}
                  onBlur={touch("postLoginUrl")}
                  placeholder="**/"
                  className={inputCls(false, fields.postLoginUrl, "postLoginUrl")}
                />
              </div>
            </div>
          )}

          {submitted && !canSave && (
            <p className="operator-danger text-xs">
              {isOAuth
                ? text.oauthRequired
                : text.passwordRequired}
            </p>
          )}
    </ModalShell>
  );
}
