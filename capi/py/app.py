import pandas as pd
import random
from datetime import datetime, timedelta

# 1. Load your Excel dataset
# Make sure you have 'openpyxl' installed (pip install openpyxl) to read/write xlsx
df = pd.read_excel('file.xlsx')

# 2. Base dates for the start of the 21:00 (9 PM) shifts
base_dates = [
    datetime(2026, 5, 28),
    datetime(2026, 5, 29),
    datetime(2026, 5, 30),
    datetime(2026, 5, 31),
    datetime(2026, 6, 1)
]

def generate_random_capi_time():
    """Generates a 10-digit Unix timestamp between 21:00 and 06:00."""
    # Pick a random date from the list above
    selected_date = random.choice(base_dates)
    
    # Set the start time to exactly 21:00 (9 PM) on that date
    start_time = selected_date.replace(hour=21, minute=0, second=0)
    
    # 9 hours between 21:00 and 06:00 the next day = 32,400 seconds
    random_seconds = random.randint(0, 32400)
    
    # Add the random amount of seconds to the 9 PM start time
    random_time = start_time + timedelta(seconds=random_seconds)
    
    # Convert to standard 10-digit Unix timestamp (exactly like your image)
    # This automatically handles the conversion to Epoch time
    return int(random_time.timestamp())

# 3. Apply the function to overwrite the 'event_time' column
df['event_time'] = df.apply(lambda row: generate_random_capi_time(), axis=1)

# 4. Save the updated data back as an Excel file
df.to_excel('updated_capi_data.xlsx', index=False)

print("Excel file successfully updated with new Unix timestamps!")