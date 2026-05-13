import { Modal, Button, Space, Typography } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

interface DeleteDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseName: string;
  onConfirm: () => void;
  isDemo?: boolean;
}

const DeleteDatabaseModal = ({
  open,
  onOpenChange,
  databaseName,
  onConfirm,
  isDemo = false,
}: DeleteDatabaseModalProps) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      data-testid="delete-database-modal"
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: "#ba1a1a" }} />
          <span>Delete database</span>
        </Space>
      }
    >
      {isDemo ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text strong>Demo databases cannot be deleted.</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Demo databases are read-only and shared across all users. Only databases you have created can be deleted.
          </Typography.Paragraph>
          <Button type="primary" onClick={() => onOpenChange(false)} data-testid="delete-modal-cancel">
            OK
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Paragraph style={{ margin: 0 }}>
            Are you sure you want to delete <Typography.Text strong>&quot;{databaseName}&quot;</Typography.Text>?
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            This action cannot be undone. All data and schema information for this database will be permanently removed.
          </Typography.Paragraph>
          <Space>
            <Button onClick={() => onOpenChange(false)} data-testid="delete-modal-cancel">
              Cancel
            </Button>
            <Button type="primary" danger onClick={handleConfirm} data-testid="delete-modal-confirm">
              Delete database
            </Button>
          </Space>
        </Space>
      )}
    </Modal>
  );
};

export default DeleteDatabaseModal;
