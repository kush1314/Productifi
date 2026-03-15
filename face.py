import cv2
import numpy as np
import time
import argparse
import os
import json

try:
    from tensorflow.keras.models import model_from_json
    TF_AVAILABLE = True
except Exception:
    TF_AVAILABLE = False

# --- Configuration ---
EMOTION_JSON = "fer.json"
EMOTION_WEIGHTS = "fer.h5"
FACE_CASCADE = 'haarcascade_frontalface_default.xml'

# Basic emotion labels (matches many FER models). If you use a different model,
# update this list to match your model's outputs.
EMOTIONS = ('angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral')


def load_emotion_model(json_path=EMOTION_JSON, weights_path=EMOTION_WEIGHTS):
    if not TF_AVAILABLE:
        print("TensorFlow / Keras not available. Emotion model disabled.")
        return None
    if not os.path.exists(json_path) or not os.path.exists(weights_path):
        print(f"Emotion model files not found: {json_path}, {weights_path}")
        return None
    with open(json_path, 'r') as f:
        model = model_from_json(f.read())
    model.load_weights(weights_path)
    return model


def get_face_detector(cascade_path=FACE_CASCADE):
    if not os.path.exists(cascade_path):
        print(f"Face cascade file missing: {cascade_path}")
        return None
    return cv2.CascadeClassifier(cascade_path)


def preprocess_face_for_emotion(gray_face):
    face = cv2.resize(gray_face, (48, 48))
    face = cv2.equalizeHist(face)
    face = face.astype('float32') / 255.0
    face = np.expand_dims(face, axis=0)
    face = np.expand_dims(face, axis=-1)
    return face


def simple_face_tracker(prev_faces, detected_faces, max_distance=50):
    # prev_faces: dict id -> centroid
    # detected_faces: list of (x,y,w,h)
    new_mapping = {}
    used_ids = set()
    centroids = [((x + w//2), (y + h//2)) for (x, y, w, h) in detected_faces]
    for i, c in enumerate(centroids):
        best_id = None
        best_dist = None
        for fid, pc in prev_faces.items():
            d = np.hypot(pc[0]-c[0], pc[1]-c[1])
            if best_dist is None or d < best_dist:
                best_dist = d
                best_id = fid
        if best_dist is not None and best_dist < max_distance and best_id not in used_ids:
            new_mapping[best_id] = c
            used_ids.add(best_id)
        else:
            # assign a new id
            new_id = max(prev_faces.keys(), default=-1) + 1
            while new_id in used_ids:
                new_id += 1
            new_mapping[new_id] = c
            used_ids.add(new_id)
    return new_mapping


def main(args):
    model = load_emotion_model() if args.emotions else None
    face_detector = get_face_detector()

    if face_detector is None:
        print('No face detector available. Please add', FACE_CASCADE)
        return

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        print('Cannot open camera')
        return

    emotion_history = {}
    history_size = 5
    prev_centroids = {}

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(gray, scaleFactor=1.3, minNeighbors=5, minSize=(50,50))

        # Track faces with simple centroid tracker
        mapping = simple_face_tracker(prev_centroids, faces.tolist() if len(faces)>0 else [], max_distance=80) if len(prev_centroids)>0 or len(faces)>0 else {}
        prev_centroids = mapping.copy()

        for fid, (cx, cy) in mapping.items():
            # find matching rect for this centroid
            matched = None
            for (x, y, w, h) in faces:
                if abs((x + w//2) - cx) < 30 and abs((y + h//2) - cy) < 30:
                    matched = (x, y, w, h)
                    break
            if matched is None:
                continue
            x, y, w, h = matched
            cv2.rectangle(frame, (x, y), (x+w, y+h), (255,0,0), 2)

            if model is not None and args.emotions:
                roi_gray = gray[y:y+h, x:x+w]
                face_input = preprocess_face_for_emotion(roi_gray)
                preds = model.predict(face_input, verbose=0)[0]
                # maintain history
                emotion_history.setdefault(fid, []).append(preds)
                if len(emotion_history[fid]) > history_size:
                    emotion_history[fid].pop(0)
                avg = np.mean(emotion_history[fid], axis=0)
                midx = np.argmax(avg)
                emotion = EMOTIONS[midx]
                conf = avg[midx]
                cv2.putText(frame, f"{emotion} {conf:.0%}", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

        # Conversation heuristic: more than one face -> possible conversation
        if len(faces) > 1 and args.conversation:
            cv2.putText(frame, f"Multiple people ({len(faces)}) - possible conversation", (10,30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,255), 2)

        # Simple looking away heuristic: if face centroid is far from frame center
        if args.looking_away and len(mapping)>0:
            h, w = frame.shape[:2]
            for fid, (cx, cy) in mapping.items():
                dx = abs(cx - w//2)
                dy = abs(cy - h//2)
                if dx > w*0.25:
                    cv2.putText(frame, f"Face {fid}: looking away/horizontally off-center", (10, h-30 - 20*fid), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

        # Return JSON response
        if len(faces) > 0:
            response = json.dumps({"status": "stop"})
            print(response)

        # Display 'STOP' on screen
        if len(faces) > 0:
            cv2.putText(frame, "STOP", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)

        cv2.imshow('Monitor', frame)
        key = cv2.waitKey(10) & 0xFF
        if key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Work-monitor: emotion, looking-away, conversation heuristics')
    parser.add_argument('--camera', type=int, default=0)
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--emotions', action='store_true', help='Enable emotion recognition (requires fer.json & fer.h5)')
    parser.add_argument('--looking-away', action='store_true', help='Enable simple looking-away heuristic')
    parser.add_argument('--conversation', action='store_true', help='Enable multi-face conversation heuristic')
    args = parser.parse_args()
    main(args)