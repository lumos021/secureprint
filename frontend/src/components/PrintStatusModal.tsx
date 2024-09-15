import React, { useState, useEffect } from 'react';
import styles from './PrintStatusModal.module.css';

const steps = [
  { id: 'send', message: 'Sending files to server...' },
  { id: 'process', message: 'Processing files on server...' },
  { id: 'shopSend', message: 'Sending files to shop...' },
  { id: 'print', message: 'Printing files...' },
  { id: 'delete', message: 'Securely deleting files from server...' },
];

const PrintStatusModal = ({ isOpen, onClose, currentStatus }) => {
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    const currentIndex = steps.findIndex(step => step.id === currentStatus);
    setCompletedSteps(steps.slice(0, currentIndex + 1).map(step => step.id));
  }, [currentStatus]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Print Status</h2>
        <div className={styles.stepContainer}>
          {steps.map((step, index) => (
            <div key={step.id} className={`${styles.step} ${completedSteps.includes(step.id) ? styles.stepCompleted : ''}`}>
              <div className={`${styles.stepIcon} ${completedSteps.includes(step.id) ? styles.completed : ''}`}>
                {completedSteps.includes(step.id) ? '✓' : index + 1}
              </div>
              <div className={styles.stepMessage}>{step.message}</div>
            </div>
          ))}
        </div>
        {currentStatus === 'delete' && (
          <button onClick={onClose} className={styles.closeButton}>Close</button>
        )}
      </div>
    </div>
  );
};

export default PrintStatusModal;
