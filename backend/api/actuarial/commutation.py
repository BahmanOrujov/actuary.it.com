import pandas as pd
import numpy as np
import os

def load_commutation_table(discount_rate):
    """
    Loads Monthlydeathtable.csv and calculates commutation functions.
    discount_rate is assumed to be the effective monthly interest rate 
    (or exactly what is passed as uçot dərəcəsi).
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    file_path = os.path.join(base_dir, 'data', 'Monthlydeathtable.csv')
    
    # Read the CSV
    df = pd.read_csv(file_path)
    
    # Clean string numbers if they contain commas
    if df['l(x)'].dtype == object:
        df['l(x)'] = df['l(x)'].str.replace(',', '').astype(float)
    if df['d(x)'].dtype == object:
        df['d(x)'] = df['d(x)'].str.replace(',', '').astype(float)
        
    # The row index represents the month index (x)
    # df.index is [0, 1, 2, ..., N-1]
    
    # 1. qx = d(x) / l(x)
    df['qx'] = df['d(x)'] / df['l(x)']
    
    # 2. px = (l(x) - l(x+1)) / l(x)
    # Using shift(-1) to get l(x+1)
    df['l_x_plus_1'] = df['l(x)'].shift(-1)
    # The last row will have NaN for l(x+1), we fill it with 0
    df['l_x_plus_1'] = df['l_x_plus_1'].fillna(0)
    df['px'] = (df['l(x)'] - df['l_x_plus_1']) / df['l(x)']
    
    # 3. v = 1 / (1 + uçot dərəcəsi)
    v = 1.0 / (1.0 + discount_rate)
    
    # We use the row index as the exponent x
    # 3(bis). Dx = l(x) * v^x
    df['Dx'] = df['l(x)'] * (v ** df.index)
    
    # 4. Cx = d(x) * v^(x+1)
    df['Cx'] = df['d(x)'] * (v ** (df.index + 1))
    
    # 5. Nx = sum of Dx from month of X to last one include last one
    # This is a reverse cumulative sum
    df['Nx'] = df['Dx'].iloc[::-1].cumsum().iloc[::-1]
    
    # 6. Mx = sum of Cx from month of X to last one include last one
    df['Mx'] = df['Cx'].iloc[::-1].cumsum().iloc[::-1]
    
    return df
