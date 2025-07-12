-- เพิ่มตารางที่ขาดหายไปตาม Smart Port Wiki
USE civil_service_mgmt;

-- ตาราง advance_notifications (การแจ้งเตือนล่วงหน้า)
CREATE TABLE IF NOT EXISTS advance_notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    notification_type ENUM('promotion_eligible', 'retirement_upcoming', 'training_due', 'performance_review') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    due_date DATE,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('pending', 'sent', 'read', 'dismissed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    read_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, notification_type),
    INDEX idx_due_date (due_date),
    INDEX idx_status (status)
);

-- ตาราง performance_proposals (ผลงานและข้อเสนอ)
CREATE TABLE IF NOT EXISTS performance_proposals (
    proposal_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    proposal_type ENUM('performance', 'innovation', 'efficiency', 'cost_saving') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    impact_description TEXT,
    quantitative_result DECIMAL(15,2),
    result_unit VARCHAR(50),
    submission_date DATE NOT NULL,
    evaluation_score DECIMAL(3,2), -- 0.00 - 5.00
    evaluator_id INT,
    evaluation_date DATE,
    status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected') DEFAULT 'draft',
    approval_level ENUM('department', 'ministry', 'cabinet') DEFAULT 'department',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (evaluator_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, proposal_type),
    INDEX idx_status (status),
    INDEX idx_submission_date (submission_date)
);

-- ตาราง task_assignments (การจัดการงาน)
CREATE TABLE IF NOT EXISTS task_assignments (
    task_id INT PRIMARY KEY AUTO_INCREMENT,
    assignee_id INT NOT NULL,
    assigner_id INT,
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('pending', 'in_progress', 'completed', 'cancelled', 'overdue') DEFAULT 'pending',
    assigned_date DATE NOT NULL,
    due_date DATE,
    completion_date DATE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    completion_percentage TINYINT DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assignee_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (assigner_id) REFERENCES civil_servants(servant_id),
    INDEX idx_assignee_status (assignee_id, status),
    INDEX idx_due_date (due_date),
    INDEX idx_priority (priority)
);

-- ตาราง ml_predictions (การคาดการณ์ AI)
CREATE TABLE IF NOT EXISTS ml_predictions (
    prediction_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    prediction_type ENUM('career_path', 'promotion_probability', 'retirement_risk', 'performance_trend') NOT NULL,
    prediction_data JSON,
    confidence_score DECIMAL(3,2), -- 0.00 - 1.00
    prediction_date DATE NOT NULL,
    valid_until DATE,
    model_version VARCHAR(50),
    accuracy_score DECIMAL(3,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_type (servant_id, prediction_type),
    INDEX idx_prediction_date (prediction_date)
);

-- ตาราง career_paths (เส้นทางความก้าวหน้า)
CREATE TABLE IF NOT EXISTS career_paths (
    path_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id INT NOT NULL,
    current_position VARCHAR(255),
    target_position VARCHAR(255),
    estimated_timeline_months INT,
    required_skills TEXT,
    required_training TEXT,
    probability_score DECIMAL(3,2),
    path_status ENUM('active', 'completed', 'modified', 'abandoned') DEFAULT 'active',
    created_by INT,
    approved_by INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (created_by) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (approved_by) REFERENCES civil_servants(servant_id),
    INDEX idx_servant_status (servant_id, path_status)
);

-- ตาราง candidate_lists (รายชื่อผู้สมัคร)
CREATE TABLE IF NOT EXISTS candidate_lists (
    list_id INT PRIMARY KEY AUTO_INCREMENT,
    list_name VARCHAR(255) NOT NULL,
    position_title VARCHAR(255),
    department VARCHAR(255),
    criteria_json JSON,
    created_by INT,
    status ENUM('draft', 'active', 'completed', 'archived') DEFAULT 'draft',
    max_candidates INT DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES civil_servants(servant_id),
    INDEX idx_status (status),
    INDEX idx_created_by (created_by)
);

-- ตาราง candidate_list_members (สมาชิกในรายชื่อผู้สมัคร)
CREATE TABLE IF NOT EXISTS candidate_list_members (
    member_id INT PRIMARY KEY AUTO_INCREMENT,
    list_id INT NOT NULL,
    servant_id INT NOT NULL,
    score DECIMAL(5,2),
    ranking INT,
    match_percentage DECIMAL(3,2),
    notes TEXT,
    added_by INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES candidate_lists(list_id),
    FOREIGN KEY (servant_id) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (added_by) REFERENCES civil_servants(servant_id),
    UNIQUE KEY unique_list_servant (list_id, servant_id),
    INDEX idx_ranking (list_id, ranking)
);

-- ตาราง network_connections (เครือข่ายบุคลากร)
CREATE TABLE IF NOT EXISTS network_connections (
    connection_id INT PRIMARY KEY AUTO_INCREMENT,
    servant_id_1 INT NOT NULL,
    servant_id_2 INT NOT NULL,
    connection_type ENUM('colleague', 'mentor', 'mentee', 'collaborator', 'supervisor', 'subordinate') NOT NULL,
    strength ENUM('weak', 'medium', 'strong') DEFAULT 'medium',
    established_date DATE,
    last_interaction DATE,
    interaction_count INT DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (servant_id_1) REFERENCES civil_servants(servant_id),
    FOREIGN KEY (servant_id_2) REFERENCES civil_servants(servant_id),
    UNIQUE KEY unique_connection (servant_id_1, servant_id_2),
    INDEX idx_servant_type (servant_id_1, connection_type),
    INDEX idx_strength (strength)
);

-- ตาราง photo_versions (เวอร์ชันของภาพ)
CREATE TABLE IF NOT EXISTS photo_versions (
    version_id INT PRIMARY KEY AUTO_INCREMENT,
    photo_id INT NOT NULL,
    version_type ENUM('original', 'thumbnail', 'medium', 'compressed') NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,
    width INT,
    height INT,
    quality_score DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES civil_servant_photos(photo_id),
    INDEX idx_photo_type (photo_id, version_type)
);
