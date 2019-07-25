const router = require('express').Router()
const Parse = require('parse/node').Parse;
const {parseConfig, recommendationsSample, likedSample, hatedSample, MAX_RATING} = require('../config')

Parse.initialize(parseConfig.appId, "", parseConfig.masterKey)
Parse.serverURL = parseConfig.serverURL

router.get('/restaurants/recommendations', (req, res) => {
    const location = req.body.location ? req.body.location: "Sunnyvale"
    const likedPhotos = req.body.likedPhotos ? req.body.likedPhotos : likedSample
    const hatedPhotos = req.body.hatedPhotos ? req.body.hatedPhotos : hatedSample
    let inputDict = {}
    
    for (photo of likedPhotos) {
        if (!(photo.restaurantYelpId in inputDict)) {
            inputDict[photo.restaurantYelpId] = {
                liked: 0,
                hated: 0
            }
        }
        inputDict[photo.restaurantYelpId]["liked"] = (inputDict[photo.restaurantYelpId]["liked"] || 0) + 1
    }
    for (photo of hatedPhotos) {
        if (!(photo.restaurantYelpId in inputDict)) {
            inputDict[photo.restaurantYelpId] = {
                liked: 0,
                hated: 0
            }
        }
        inputDict[photo.restaurantYelpId]["hated"] = (inputDict[photo.restaurantYelpId]["hated"] || 0) + 1
    }

    const Restaurants = Parse.Object.extend("Restaurants")
    const query = new Parse.Query(Restaurants)
    query.equalTo("city", location)
    query.descending("reviewCount")
    query.find().then(results => {
        results = JSON.stringify(results)
        results = JSON.parse(results)
        const mostReviews = results[0]["reviewCount"]
        
        for (restaurant of results) {
            ratingParams = {    
                photosLikedCount: inputDict[restaurant.yelpId] ? inputDict[restaurant.yelpId]["liked"] : 0,
                photosHatedCount: inputDict[restaurant.yelpId] ? inputDict[restaurant.yelpId]["hated"] : 0,
                restaurantLikes: restaurant.likeCount,
                restaurantDislikes: restaurant.unlikeCount,
                rating: restaurant.rating,
                reviewCount: restaurant.reviewCount

            }
            restaurantScore = weightedScore(ratingParams, mostReviews)
            restaurant["score"] = restaurantScore;
        }
        results.sort((a, b) => {return b["score"] - a["score"]});
        res.json({results:results.slice(0, 3)})
    })
})  

router.get('/restaurants/:id', (req, res) => {
    const {id} = req.params || {}
    async function fetchRestaurant() {
        const Restaurants = Parse.Object.extend("Restaurants")
        const query = new Parse.Query(Restaurants)
        query.equalTo("yelpId", id)
       
        query.first().then(restaurant => {
            restaurant = JSON.stringify(restaurant)
            restaurant = JSON.parse(restaurant)
            
            
            const Photos = Parse.Object.extend("Photos")
            const photosQuery = new Parse.Query(Photos)
            photosQuery.equalTo("restaurantYelpId", restaurant.yelpId)
            photosQuery.find().then(photos =>{
                photos = JSON.stringify(photos)
                photos = JSON.parse(photos)
                restaurantPhotos = []
                for (photo of photos) {
                    restaurantPhotos.push(photo.imageUrl)
                }

                res.json({
                    ...restaurant,
                    images: restaurantPhotos
                })
            })
        })
    }
    fetchRestaurant()
  
    
})

function weightedScore(data, mostReviews) {
    const {photosLikedCount, photosHatedCount, restaurantLikes, restaurantDislikes, rating, reviewCount} = data
    const userSwipeScore = (photosLikedCount + photosHatedCount) == 0 ? 0: (photosLikedCount/(photosLikedCount + photosHatedCount))*40
    const internalRatingScore = (restaurantLikes + restaurantDislikes) == 0 ? 0:(restaurantLikes/(restaurantLikes + restaurantDislikes))*20
    const yelpRatingScore = (rating/MAX_RATING)*25
    const reviewCountScore = (reviewCount/ mostReviews) * 15

    const restaurantScore = userSwipeScore + internalRatingScore + yelpRatingScore + reviewCountScore
    
    return restaurantScore
}


module.exports = router