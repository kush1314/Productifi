import cv2
import time
import requests
import threading
from pynput import keyboard

# State
is_running = True
typing_events = 0

# Listen to keyboard
def on_press(key):
    global typing_events
    typing_events += 1

listener = keyboard.Listener(on_press=on_press)
listener.start()

# Load Haar Cascades for face and eye tracking
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

def analyze_camera():
    global typing_events, is_running
    print("Initializing Camera Tracking... Waiting for MacOS permissions if requested.")
    
    cap = None
    while is_running:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            break
        print("Waiting for camera permission. Please click 'OK' on the MacOS prompt...")
        time.sleep(2)
        
    if not is_running:
        return

    print("Camera connected! Started OpenCV Tracking...")
    
    last_post_time = time.time()

    while is_running:
        ret, frame = cap.read()
        if not ret:
            print("Failed to read from camera. Retrying...")
            time.sleep(1)
            continue
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        # Detect face — sensitive settings so we don't miss faces
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )
        face_present = len(faces) > 0

        # Detect eyes within the first face found
        eyes_found = 0
        if face_present:
            for (x, y, w, h) in faces[:1]:
                roi_gray = gray[y:y+h, x:x+w]
                # Use lenient eye detection settings
                eyes = eye_cascade.detectMultiScale(
                    roi_gray, scaleFactor=1.1, minNeighbors=2, minSize=(15, 15)
                )
                eyes_found += len(eyes)

        # Looking-away heuristic: face centroid far from horizontal center
        looking_away = False
        if face_present and len(faces) > 0:
            fh, fw = frame.shape[:2]
            (fx, fy, fw2, fh2) = faces[0]
            face_cx = fx + fw2 // 2
            looking_away = abs(face_cx - fw // 2) > fw * 0.28

        # Attention: 100 if face+2eyes, 80 if face+1eye, 50 if face only, 0 if none
        # Reduce by 25 if looking away
        if face_present and eyes_found >= 2:
            attention = 100
        elif face_present and eyes_found == 1:
            attention = 80
        elif face_present:
            attention = 50
        else:
            attention = 0
        if looking_away:
            attention = max(0, attention - 25)

        drowsiness = face_present and eyes_found == 0
        
        current_time = time.time()
        if current_time - last_post_time >= 1.0:
            payload = {
                "face_present": face_present,
                "eye_attention_score": attention,
                "drowsiness_flag": drowsiness,
                "looking_away": looking_away,
                "typing_active": typing_events > 0,
                "typing_events": typing_events
            }
            try:
                requests.post('http://127.0.0.1:5001/api/cv/update', json=payload, timeout=0.5)
                # print(f"Posted to backend: {payload}")
            except Exception as e:
                pass
                
            # Reset typing count
            typing_events = 0
            last_post_time = current_time
            
    if cap:
        cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        analyze_camera()
    except KeyboardInterrupt:
        is_running = False
        listener.stop()
        print("Stopped CV Tracking.")

