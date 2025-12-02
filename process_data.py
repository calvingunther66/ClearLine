import pandas as pd
import json

def process_data():
    # Load data
    election_df = pd.read_csv('public/data/election_2020.csv', dtype={'county_fips': str})
    demographics_df = pd.read_csv('public/data/demographics.csv', dtype={'FIPS': str})
    education_df = pd.read_csv('public/data/education_income.csv', dtype={'FIPS': str})

    # Normalize FIPS
    election_df['county_fips'] = election_df['county_fips'].str.zfill(5)
    demographics_df['FIPS'] = demographics_df['FIPS'].str.zfill(5)
    education_df['FIPS'] = education_df['FIPS'].str.zfill(5)

    # Merge data
    merged_df = election_df.merge(demographics_df, left_on='county_fips', right_on='FIPS', how='left')
    merged_df = merged_df.merge(education_df, on='FIPS', how='left')

    # Select and rename columns
    final_df = merged_df[[
        'county_fips',
        'state_name',
        'county_name',
        'votes_gop',
        'votes_dem',
        'total_votes',
        'diff',
        'per_gop',
        'per_dem',
        'per_point_diff',
        'TOT_POP',
        'White_Alone' if 'White_Alone' in demographics_df.columns else 'NHWhite_Alone', # Check column name
        'Black',
        'Hispanic',
        'Bachelor\'s degree or higher 2014-18',
        'Percent of adults with a bachelor\'s degree or higher 2014-18',
        'Median_Household_Income_2018',
        'Unemployment_rate_2018'
    ]].copy()

    # Rename for clarity
    final_df.rename(columns={
        'county_fips': 'fips',
        'state_name': 'state',
        'county_name': 'county',
        'TOT_POP': 'population',
        'NHWhite_Alone': 'white_pop', # Using NHWhite_Alone based on header check
        'Black': 'black_pop',
        'Hispanic': 'hispanic_pop',
        'Bachelor\'s degree or higher 2014-18': 'bachelors_degree_count',
        'Percent of adults with a bachelor\'s degree or higher 2014-18': 'bachelors_degree_pct',
        'Median_Household_Income_2018': 'median_income',
        'Unemployment_rate_2018': 'unemployment_rate'
    }, inplace=True)

    # Calculate percentages
    final_df['white_pct'] = final_df['white_pop'] / final_df['population']
    final_df['black_pct'] = final_df['black_pop'] / final_df['population']
    final_df['hispanic_pct'] = final_df['hispanic_pop'] / final_df['population']
    
    # Handle missing values
    final_df.fillna(0, inplace=True)

    # Convert to dictionary
    data = final_df.to_dict(orient='records')

    # Save to JSON
    with open('public/data/processed_data.json', 'w') as f:
        json.dump(data, f)

    print("Data processed and saved to public/data/processed_data.json")

if __name__ == "__main__":
    process_data()
