require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5001;

// Debug: Log environment variables
console.log('Environment variables loaded:');
console.log('PORT:', process.env.PORT);

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Add OPTIONS handler for CORS preflight requests
app.options('*', cors());

const MEALDB_BASE_URL = 'https://www.themealdb.com/api/json/v1/1';

// Helper function to format recipe data
const formatRecipe = (meal) => ({
  id: meal.idMeal,
  title: meal.strMeal,
  image: meal.strMealThumb,
  ingredients: Object.keys(meal)
    .filter(key => key.startsWith('strIngredient') && meal[key])
    .map(key => {
      const index = key.replace('strIngredient', '');
      return `${meal[key]} - ${meal[`strMeasure${index}`] || ''}`;
    }),
  instructions: meal.strInstructions.split('\n').filter(step => step.trim()),
  cookingTime: 30, // TheMealDB doesn't provide cooking time
  servings: 4, // TheMealDB doesn't provide servings
  dietary: [
    ...(meal.strTags ? meal.strTags.split(',').map(tag => tag.trim()) : []),
  ],
  cuisine: meal.strArea || 'Any',
  sourceUrl: meal.strSource || meal.strYoutube,
  category: meal.strCategory
});

// Test endpoint to check API
app.get('/api/test', async (req, res) => {
  try {
    const response = await axios.get(`${MEALDB_BASE_URL}/random.php`);
    res.json({
      message: 'API is working!',
      recipe: response.data.meals[0].strMeal
    });
  } catch (error) {
    res.status(500).json({
      error: 'API test failed',
      message: error.message
    });
  }
});

app.post('/api/recipes/search', async (req, res) => {
  try {
    console.log('Received recipe search request:', req.body);
    const { ingredients, dietaryPreferences, cuisine, cookingTime, servings } = req.body;

    // Validate required fields
    if (!ingredients || ingredients.length === 0) {
      return res.status(400).json({
        error: 'Missing ingredients',
        message: 'Please provide at least one ingredient'
      });
    }

    // Search by main ingredient
    const mainIngredient = Array.isArray(ingredients) ? ingredients[0] : ingredients.split(',')[0];
    console.log('Searching with main ingredient:', mainIngredient);

    try {
      // First try to search by ingredient
      const searchResponse = await axios.get(`${MEALDB_BASE_URL}/filter.php`, {
        params: {
          i: mainIngredient
        }
      });

      console.log('Search response status:', searchResponse.status);
      console.log('Number of results:', searchResponse.data.meals?.length || 0);

      if (!searchResponse.data.meals || searchResponse.data.meals.length === 0) {
        // If no results, try searching by name
        const nameResponse = await axios.get(`${MEALDB_BASE_URL}/search.php`, {
          params: {
            s: mainIngredient
          }
        });

        if (!nameResponse.data.meals || nameResponse.data.meals.length === 0) {
          return res.status(404).json({
            error: 'No recipes found',
            message: 'Try these ingredients instead: chicken, beef, rice, pasta, fish, or vegetables',
            suggestions: [
              'chicken',
              'beef',
              'rice',
              'pasta',
              'fish',
              'vegetables'
            ]
          });
        }

        const recipes = nameResponse.data.meals.map(formatRecipe);
        return res.json({ recipes });
      }

      // Get detailed information for each recipe
      const recipePromises = searchResponse.data.meals.map(meal => 
        axios.get(`${MEALDB_BASE_URL}/lookup.php`, {
          params: {
            i: meal.idMeal
          }
        })
      );

      const detailedResponses = await Promise.all(recipePromises);
      const recipes = detailedResponses
        .map(response => formatRecipe(response.data.meals[0]))
        .filter(recipe => {
          // Filter by cuisine if specified
          if (cuisine && cuisine !== 'Any') {
            return recipe.cuisine.toLowerCase() === cuisine.toLowerCase();
          }
          return true;
        });

      if (recipes.length === 0) {
        return res.status(404).json({
          error: 'No recipes found',
          message: 'Try these ingredients instead: chicken, beef, rice, pasta, fish, or vegetables',
          suggestions: [
            'chicken',
            'beef',
            'rice',
            'pasta',
            'fish',
            'vegetables'
          ]
        });
      }

      res.json({ recipes });

    } catch (error) {
      console.error('Error in recipe search:', error.message);
      return res.status(500).json({
        error: 'Failed to fetch recipes',
        message: 'Please try again with different ingredients or preferences'
      });
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An unexpected error occurred. Please try again.'
    });
  }
});

// Add a health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('✅ TheMealDB API is configured');
}); 