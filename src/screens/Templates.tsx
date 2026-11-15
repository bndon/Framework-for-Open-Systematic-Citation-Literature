import React, { useState, useEffect } from "react";
import { getTemplates, createTemplate, updateTemplateFields, deleteTemplate } from "../lib/api";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { toast } from "../lib/toast";
import type { Template, TemplateField } from "../types";

export const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const list = await getTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(list[0].id);
        setFields(list[0].fields);
      } else if (selectedTemplateId) {
        const cur = list.find((t) => t.id === selectedTemplateId);
        if (cur) setFields(cur.fields);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load templates.");
    }
  };

  const handleSelectTemplate = (t: Template) => {
    if (isDirty) {
      setConfirmDialog({
        isOpen: true,
        title: "Discard Field Changes",
        message: "You have unsaved field changes in this template. Discard them and switch?",
        confirmLabel: "Discard & Switch",
        isDanger: false,
        onConfirm: () => {
          setSelectedTemplateId(t.id);
          setFields(t.fields);
          setIsDirty(false);
        },
      });
      return;
    }
    setSelectedTemplateId(t.id);
    setFields(t.fields);
    setIsDirty(false);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    try {
      const created = await createTemplate(newTemplateName.trim());
      setNewTemplateName("");
      setShowNewModal(false);
      await loadTemplates();
      setSelectedTemplateId(created.id);
      setFields([]);
      setIsDirty(false);
      toast.success(`Created template "${created.name}"`);
    } catch (err: any) {
      toast.error("Error creating template: " + err?.toString());
    }
  };

  const handleDeleteTemplate = (id: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Template",
      message: `Delete template "${name}"? Extractions linked to this template may no longer be visible.`,
      confirmLabel: "Delete Template",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteTemplate(id);
          const remaining = templates.filter((t) => t.id !== id);
          setTemplates(remaining);
          if (selectedTemplateId === id) {
            setSelectedTemplateId(remaining[0]?.id || null);
            setFields(remaining[0]?.fields || []);
          }
          toast.success(`Deleted template "${name}"`);
        } catch (err: any) {
          toast.error("Error deleting template: " + err?.toString());
        }
      },
    });
  };

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !selectedTemplateId) return;

    const newF: TemplateField = {
      id: "f-" + Math.random().toString(36).slice(2, 8),
      template_id: selectedTemplateId,
      name: newFieldName.trim(),
      position: fields.length,
    };

    setFields([...fields, newF]);
    setNewFieldName("");
    setIsDirty(true);
  };

  const handleRemoveField = (fieldId: string) => {
    setFields(fields.filter((f) => f.id !== fieldId));
    setIsDirty(true);
  };

  const handleMoveField = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;

    const copy = [...fields];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    // reindex positions
    const reindexed = copy.map((f, i) => ({ ...f, position: i }));
    setFields(reindexed);
    setIsDirty(true);
  };

  const handleRenameField = (fieldId: string, newName: string) => {
    setFields(fields.map((f) => (f.id === fieldId ? { ...f, name: newName } : f)));
    setIsDirty(true);
  };

  const handleSaveFields = async () => {
    if (!selectedTemplateId) return;
    try {
      await updateTemplateFields(selectedTemplateId, fields);
      setIsDirty(false);
      toast.success("Template fields saved successfully!");
      await loadTemplates();
    } catch (err: any) {
      toast.error("Error saving template fields: " + err?.toString());
    }
  };

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel: Templates list */}
      <div
        style={{
          width: "280px",
          minWidth: "280px",
          backgroundColor: "#FAF7F2",
          borderRight: "1px solid #E4DACB",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 16px",
            borderBottom: "1px solid #EADDCB",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#4A2418" }}>
            Templates
          </h2>
          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: "4px 10px",
              backgroundColor: "#8A5A7A",
              color: "#FAF5EC",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
          {templates.length === 0 ? (
            <div style={{ padding: "20px 10px", textAlign: "center", color: "#8A796F", fontSize: "13px" }}>
              No templates found.
            </div>
          ) : (
            templates.map((tmpl) => {
              const isActive = tmpl.id === selectedTemplateId;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    marginBottom: "4px",
                    cursor: "pointer",
                    backgroundColor: isActive ? "#8A5A7A" : "transparent",
                    color: isActive ? "#FAF5EC" : "#4A2418",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📋 {tmpl.name}
                  </span>
                  {tmpl.id !== "default" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(tmpl.id, tmpl.name);
                      }}
                      title="Delete template"
                      style={{
                        background: "none",
                        border: "none",
                        color: isActive ? "#FAF5EC" : "#8A796F",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Template fields editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", backgroundColor: "#fff" }}>
        {currentTemplate ? (
          <div style={{ padding: "28px 36px", maxWidth: "800px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingBottom: "16px",
                borderBottom: "1px solid #EFE6D8",
              }}
            >
              <div>
                <h1 style={{ fontSize: "22px", color: "#4A2418", margin: "0 0 4px 0" }}>
                  {currentTemplate.name}
                </h1>
                <p style={{ margin: 0, fontSize: "13px", color: "#7A6458" }}>
                  Define the structured fields extracted from papers in this template.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {isDirty && (
                  <span style={{ fontSize: "12px", color: "#B7950B", fontWeight: 600 }}>
                    ● Unsaved changes
                  </span>
                )}
                <button
                  onClick={handleSaveFields}
                  disabled={!isDirty}
                  style={{
                    padding: "8px 18px",
                    backgroundColor: isDirty ? "#8A5A7A" : "#D5C8B8",
                    color: "#FAF5EC",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: isDirty ? "pointer" : "default",
                  }}
                >
                  Save Fields Order
                </button>
              </div>
            </div>

            {/* Add New Field Form */}
            <form onSubmit={handleAddField} style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="New field name, e.g. Statistical Significance, Primary Datasets..."
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #C4B5A5",
                  fontSize: "13px",
                }}
              />
              <button
                type="submit"
                disabled={!newFieldName.trim()}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#6E4363",
                  color: "#FAF5EC",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                + Add Field
              </button>
            </form>

            {/* Fields List with Reordering */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    backgroundColor: "#FAF7F2",
                    borderRadius: "6px",
                    border: "1px solid #EADDCB",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "#8A796F", minWidth: "24px", fontWeight: 700 }}>
                    #{idx + 1}
                  </span>

                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => handleRenameField(field.id, e.target.value)}
                    style={{
                      flex: 1,
                      padding: "5px 8px",
                      borderRadius: "4px",
                      border: "1px solid #D5C8B8",
                      fontSize: "13px",
                      backgroundColor: "#fff",
                      color: "#4A2418",
                    }}
                  />

                  {/* Reorder Buttons */}
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveField(idx, "up")}
                      style={{
                        padding: "3px 8px",
                        backgroundColor: "#fff",
                        border: "1px solid #D5C8B8",
                        borderRadius: "4px",
                        cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.4 : 1,
                        fontSize: "12px",
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === fields.length - 1}
                      onClick={() => handleMoveField(idx, "down")}
                      style={{
                        padding: "3px 8px",
                        backgroundColor: "#fff",
                        border: "1px solid #D5C8B8",
                        borderRadius: "4px",
                        cursor: idx === fields.length - 1 ? "default" : "pointer",
                        opacity: idx === fields.length - 1 ? 0.4 : 1,
                        fontSize: "12px",
                      }}
                    >
                      ▼
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveField(field.id)}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#C0392B",
                      cursor: "pointer",
                      fontSize: "15px",
                      padding: "0 4px",
                    }}
                    title="Remove field"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: "60px", textAlign: "center", color: "#8A796F" }}>
            Select a template from the left sidebar to view its configuration.
          </div>
        )}
      </div>

      {/* New Template Modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Create New Template">
        <form onSubmit={handleCreateTemplate}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4A2418", marginBottom: "6px" }}>
              Template Name
            </label>
            <input
              type="text"
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="e.g. Clinical Trial Review, Benchmark Analysis..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #C4B5A5",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              style={{
                padding: "8px 16px",
                backgroundColor: "#fff",
                border: "1px solid #D5C8B8",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTemplateName.trim()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#8A5A7A",
                color: "#FAF5EC",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Styled Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        isDanger={confirmDialog.isDanger}
      />
    </div>
  );
};
