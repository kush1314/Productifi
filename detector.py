import base64
import collections
import os
import threading
import time

import cv2
import numpy as np


ROOT = os.path.dirname(__file__)
FACE_CASCADE = os.path.join(ROOT, 'haarcascade_frontalface_default.xml')
FER_JSON = os.path.join(ROOT, 'fer.json')
FER_WEIGHTS = os.path.join(ROOT, 'fer.h5')
EMOTIONS = ('angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral')


try:
    import mediapipe as mp
    _face_mesh_module = getattr(getattr(mp, 'solutions', None), 'face_mesh', None)
    MP_AVAILABLE = _face_mesh_module is not None
except Exception:
    _face_mesh_module = None
    MP_AVAILABLE = False


try:
    from tensorflow.keras.models import model_from_json
    TF_AVAILABLE = True
except Exception:
    model_from_json = None
    TF_AVAILABLE = False


def load_emotion_model():
    if not TF_AVAILABLE:
        return None
    if not (os.path.exists(FER_JSON) and os.path.exists(FER_WEIGHTS)):
        return None
    try:
        with open(FER_JSON, 'r', encoding='utf-8') as f:
            model = model_from_json(f.read())
        model.load_weights(FER_WEIGHTS)
        return model
    except Exception:
        return None


class Detector(threading.Thread):
    """Background detector that streams JPEG frames + focus/emotion status."""

    def __init__(self, camera=0, width=640, height=480, emotion_model=None):
        super().__init__(daemon=True)
        self.camera = camera
        self.width = width
        self.height = height
        self.running = False
        self.latest_frame_b64 = None
        self.latest_status = {}

        self.face_cascade = cv2.CascadeClassifier(FACE_CASCADE)
        self.emotion_model = emotion_model if emotion_model is not None else load_emotion_model()
        self.recent_away_states = collections.deque(maxlen=10)

    def _estimate_yaw_with_mesh(self, frame, mesh):
        if mesh is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None

        lm = result.multi_face_landmarks[0].landmark
        h, w = frame.shape[:2]
        left_x = lm[33].x * w
        right_x = lm[263].x * w
        nose_x = lm[1].x * w
        eye_mid = (left_x + right_x) / 2.0
        eye_span = max(1.0, abs(right_x - left_x))

        yaw_norm = (nose_x - eye_mid) / (eye_span / 2.0)
        yaw_norm = max(-1.0, min(1.0, yaw_norm))
        return yaw_norm * 45.0

    def _predict_emotion(self, gray_frame, face_rect):
        if self.emotion_model is None:
            return 'unknown', 0.0

        x, y, w, h = face_rect
        roi_gray = gray_frame[y:y + h, x:x + w]
        if roi_gray.size == 0:
            return 'unknown', 0.0

        roi_gray = cv2.resize(roi_gray, (48, 48))
        roi_gray = cv2.equalizeHist(roi_gray)
        roi_gray = cv2.GaussianBlur(roi_gray, (3, 3), 0)
        img = roi_gray.astype('float32') / 255.0
        img = np.expand_dims(np.expand_dims(img, axis=0), axis=-1)

        try:
            pred = self.emotion_model.predict(img, verbose=0)[0]
            idx = int(np.argmax(pred))
            return EMOTIONS[idx], float(pred[idx])
        except Exception:
            return 'unknown', 0.0

    def _annotate(self, frame, faces, status):
        annotated = frame.copy()
        for (x, y, w, h) in faces:
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (53, 162, 235), 2)

        cv2.putText(
            annotated,
            f"Faces: {status.get('num_faces', 0)}",
            (12, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            annotated,
            f"Looking away: {'YES' if status.get('smoothed_looking_away') else 'no'}",
            (12, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (20, 80, 240) if status.get('smoothed_looking_away') else (45, 190, 85),
            2,
            cv2.LINE_AA,
        )
        if status.get('emotion') and status.get('emotion') != 'unknown':
            conf = int(status.get('emotion_confidence', 0.0) * 100)
            cv2.putText(
                annotated,
                f"Emotion: {status['emotion']} ({conf}%)",
                (12, 76),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
        return annotated

    def run(self):
        cap = cv2.VideoCapture(self.camera)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, 30)

        if not cap.isOpened():
            print('Detector: cannot open camera')
            return

        face_mesh = None
        if MP_AVAILABLE and _face_mesh_module is not None:
            try:
                face_mesh = _face_mesh_module.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=False,
                    min_detection_confidence=0.4,
                    min_tracking_confidence=0.4,
                )
            except Exception:
                face_mesh = None

        self.running = True

        while self.running:
            ret, frame = cap.read()
            if not ret:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=6,
                minSize=(44, 44),
            )

            num_faces = len(faces)
            looking_away = num_faces == 0
            pose_list = []

            if num_faces > 0:
                x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
                frame_h, frame_w = frame.shape[:2]
                cx = x + w / 2.0
                cy = y + h / 2.0
                off_x = abs(cx - frame_w / 2.0) / (frame_w / 2.0)
                off_y = abs(cy - frame_h / 2.0) / (frame_h / 2.0)
                area_ratio = (w * h) / float(frame_w * frame_h)
                looking_away = off_x > 0.42 or off_y > 0.38 or area_ratio < 0.014

                yaw = self._estimate_yaw_with_mesh(frame, face_mesh)
                if yaw is not None:
                    pose_list = [{'yaw': float(yaw)}]
                    if abs(yaw) > 18:
                        looking_away = True

                emotion, emotion_conf = self._predict_emotion(gray, (x, y, w, h))
            else:
                emotion, emotion_conf = 'unknown', 0.0

            self.recent_away_states.append(1 if looking_away else 0)
            smoothed_away = (sum(self.recent_away_states) / max(1, len(self.recent_away_states))) > 0.45

            status = {
                'timestamp': time.time(),
                'num_faces': int(num_faces),
                'face_poses': pose_list,
                'looking_away': bool(looking_away),
                'smoothed_looking_away': bool(smoothed_away),
                'emotion': emotion,
                'emotion_confidence': float(emotion_conf),
            }

            annotated = self._annotate(frame, faces, status)
            ok, encoded = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok:
                self.latest_frame_b64 = base64.b64encode(encoded.tobytes()).decode('ascii')
            self.latest_status = status

        if face_mesh is not None:
            try:
                face_mesh.close()
            except Exception:
                pass
        cap.release()

    def stop(self):
        self.running = False


if __name__ == '__main__':
    detector = Detector()
    detector.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        detector.stop()
        detector.join()
