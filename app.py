from flask import Flask, request, jsonify
import pandas as pd
import joblib
import json
import lightgbm as lgb
from flask_cors import CORS

MODEL_PATH = 'lgbm_food_waste_predictor.joblib'
ENCODER_PATH = 'one_hot_encoder.joblib'

try:
    model = joblib.load(MODEL_PATH)
    encoder = joblib.load(ENCODER_PATH)
    print("ML model and encoder loaded successfully")
except Exception as e:
    print(f"Error loading model or encoder: {e}")
    exit()

NUM_FEATURES = ['Cost_Loss', 'Year', 'Month', 'Day', 'DayOfWeek', 'WeekOfYear']
CAT_FEATURES = ['Meal', 'Canteen_Section', 'Food_Category']

app = Flask(__name__)
CORS(app)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json(force=True)
        df = pd.DataFrame([data])

        df['Date'] = pd.to_datetime(df['Date'])
        df['Year'] = df['Date'].dt.year
        df['Month'] = df['Date'].dt.month
        df['Day'] = df['Date'].dt.day
        df['DayOfWeek'] = df['Date'].dt.dayofweek
        df['WeekOfYear'] = df['Date'].dt.isocalendar().week.astype(int)

        if 'Cost_Loss' not in df.columns or pd.isna(df['Cost_Loss'].iloc[0]):
            df['Cost_Loss'] = 0.0

        encoded = encoder.transform(df[CAT_FEATURES])
        encoded_df = pd.DataFrame(encoded, columns=encoder.get_feature_names_out(CAT_FEATURES))

        processed = pd.concat([df[NUM_FEATURES], encoded_df], axis=1)
        processed = processed[model.feature_name_]

        prediction = model.predict(processed)[0]
        return jsonify({'predicted_waste_kg': round(float(prediction), 2)})

    except Exception as e:
        return jsonify({'error': str(e)}), 400

TRAINING_LOG_PATH = 'data/training_log.csv'
ORIGINAL_DATA_PATH = 'data/food_waste.json'

def load_training_data():
    """Load original dataset + any accumulated training records."""
    with open(ORIGINAL_DATA_PATH) as f:
        orig = json.load(f)
    df = pd.DataFrame(orig)
    df = df.rename(columns={
        'date':'Date','meal':'Meal','section':'Canteen_Section',
        'category':'Food_Category','cost_loss':'Cost_Loss','waste_kg':'waste_kg'
    })
    try:
        extra = pd.read_csv(TRAINING_LOG_PATH)
        df = pd.concat([df, extra], ignore_index=True)
    except (FileNotFoundError, pd.errors.EmptyDataError):
        pass
    return df

def prepare_training_df(df):
    """Engineer features and encode categories for LightGBM."""
    df['Date'] = pd.to_datetime(df['Date'])
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    df['Day'] = df['Date'].dt.day
    df['DayOfWeek'] = df['Date'].dt.dayofweek
    df['WeekOfYear'] = df['Date'].dt.isocalendar().week.astype(int)
    df['Cost_Loss'] = df['Cost_Loss'].fillna(0.0)
    return df

@app.route('/train', methods=['POST'])
def train():
    """Receive new waste records and retrain the LightGBM model."""
    try:
        records = request.get_json(force=True)
        if not isinstance(records, list) or len(records) == 0:
            return jsonify({'error': 'Provide a non-empty array of records'}), 400

        # Append new records to training log
        new_df = pd.DataFrame(records)
        new_df.to_csv(TRAINING_LOG_PATH, mode='a', header=not pd.io.common.file_exists(TRAINING_LOG_PATH), index=False)

        # Load full training data
        full_df = load_training_data()
        full_df = prepare_training_df(full_df)
        full_df['waste_kg'] = pd.to_numeric(full_df['waste_kg'], errors='coerce')

        # Train new model
        X = full_df[NUM_FEATURES + CAT_FEATURES]
        y = full_df['waste_kg']

        encoded = encoder.transform(X[CAT_FEATURES])
        encoded_df = pd.DataFrame(encoded, columns=encoder.get_feature_names_out(CAT_FEATURES))
        X_processed = pd.concat([X[NUM_FEATURES].reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)

        new_model = lgb.LGBMRegressor(
            n_estimators=500, learning_rate=0.05, max_depth=7,
            subsample=0.8, colsample_bytree=0.8, random_state=42, verbose=-1
        )
        new_model.fit(X_processed, y)

        # Save model
        joblib.dump(new_model, MODEL_PATH)

        global model
        model = new_model

        return jsonify({
            'trained': True,
            'records_received': len(records),
            'total_records': len(full_df),
            'model_score': round(float(new_model.score(X_processed, y)), 4)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
