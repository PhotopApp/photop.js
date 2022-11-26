const ss = require('simple-socket-js');
const axios = require('axios');
const FormData = require('form-data');

let serverURL = 'https://photop.exotek.co/';
let assetURL = 'https://photop-content.s3.amazonaws.com/';
let exotekCDN = 'https://exotekcdn.exotektechnolog.repl.co/';
const socket = new ss({
    project_id: '61b9724ea70f1912d5e0eb11',
    project_token: 'client_a05cd40e9f0d2b814249f06fbf97fe0f1d5'
});

let activeClient;

async function request(url, method, auth, body, contentType = 'application/json') {
    let raw = {
        method: method,
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
            'Content-Type': contentType
        }
    }
    if (auth) {
        raw.headers["auth"] = auth;
    }
    if (body) {
        raw['data'] = JSON.stringify(body);
    }
    let response = await axios(serverURL + url, raw).catch(err => { console.log(err.response) });
    if (response) return response.data;
}

class client {
    constructor(auth, callback) {
        const promise = new Promise(async (resolve, reject) => {
            let data = await request('me?ss=' + socket.secureID, 'POST', auth).catch(err => reject(err));
            this.me = data;
            this.auth = auth;
            activeClient = this;
            resolve();
        });
        promise.then(callback);
    }
    onPost(callback) {
        socket.subscribe({
            task: 'general',
            location: 'home'
        }, data => {
            if (data.type == 'newpost') {
                delete data.type;
                callback(new Post(data.post));
            }
        });
    }
    onMention(callback) {
        this.onPost(async post => {
            const postData = await post.connect();
            if (postData.text.includes(`@${this.me.user._id}(${this.me.user.User})`)) {
                callback(post);
            }
        });
    }
    async getPostById(id) {
        let data = await request('posts/?postid=' + id, 'GET');
        return data.posts[0];
    }
    async getUserById(id) {
        let data = await request('user/?id=' + id, 'GET');
        return new User(data);
    }
    async getUserByName(name) {
        let data = await request('user/?name=' + name, 'GET');
        return new User(data);
    }
    createPost(text, media = [], groupid = '') {
        let body = new FormData();
        body.append('data', JSON.stringify({
            text: text
        }));
        //image code by impixel
        for (let i = 0; i != Math.min(media.length, 2); i++) {
            body.append("image-" + i, media[i], "image.jpg")
        }
        //request function didnt work, used this instead
        axios.post(serverURL + `posts/new${groupid != '' ? `?groupid=${groupid}` : ''}`, body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${body._boundary}`,
                'auth': this.auth
            }
        })
    }
}

class Post {
    constructor(post) {
        this.post = post;
    }
    async connect() {
        const data = await request('posts/?postid=' + this.post._id, 'GET');
        const postData = data.posts[0];
        let returnData = {
            _id: this.post._id,
            text: postData.Text,
            timestamp: postData.Timestamp,
            media: new Array(),
            author: new User(data.users[0])
        }
        if (postData.Media) {
            for (let i = 0; i < postData.Media.ImageCount; i++) {
                returnData.media.push(`${assetURL}/PostImages/${postData._id}/`);
            }
        }
        //this.author = new User(postData);
        return returnData;
    }
    onChat() {

    }
    onDelete(callback) {
        let query = {
            task: 'post',
            _id: this.post._id
        };
        socket.subscribe(query, data => {
            if (data.type == 'delete') {
                callback(this);
                delete this;
            }
        });
    }
    chat(text, replyID) {
        let body = { text: text };
        if (replyID) {
            body.replyID = replyID;
        }
        request(`chats/new?postid=${this.post._id}`, 'POST', activeClient.auth, body);
    }
}

class User {
    constructor(user) {
        console.log(user)
        this._id = user._id;
        this.name = user.User;
        if(user.Settings.ProfilePic)this.avatar = `${assetURL}ProfileImages/${user.Settings.ProfilePic}`;
        if(user.Settings.ProfileBanner)this.banner = `${assetURL}ProfileBanners/${user.Settings.ProfileBanner}`;
        if(user.ProfileData){
            this.description = user.ProfileData.Description;
            this.followers = user.ProfileData.Followers;
            this.following = user.ProfileData.Following;
            if(user.ProfileData.Socials){
                this.socials = user.ProfileData.Socials;
            }
        }
        
    }
    follow() {

    }
    unfollow() {

    }
    block() {

    }
    ban(reason, time, terminate) {

    }
    unban() {

    }
}

class Chat {
    constructor(chat) {

    }
    reply() {

    }
}

exports.client = client;