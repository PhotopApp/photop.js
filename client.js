const ss = require('simple-socket-js');
const axios = require('axios');

let serverURL = 'https://photop.exotek.co/';
let assetURL = 'https://photop-content.s3.amazonaws.com/';
let exotekCDN = 'https://exotekcdn.exotektechnolog.repl.co/';
const socket = new ss({
    project_id: '61b9724ea70f1912d5e0eb11',
    project_token: 'client_a05cd40e9f0d2b814249f06fbf97fe0f1d5'
});

async function request(url, method, auth, body) {
    let r = {
        method: method,
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json'
        }
    }
    if (auth) {
        r.headers["auth"] = auth;
    }
    if (body) {
        r['body'] = JSON.stringify(body)
    }
    let response = await axios(serverURL + url, r);
    return response.data;
}

class client {
    constructor(auth, callback) {
        const promise = new Promise(async (resolve, reject) => {
            let data = await request('me?ss=' + socket.secureID, 'POST', auth).catch(err => reject(err));
            this.me = data;
            this.auth = auth;
            resolve();
        });
        promise.then(callback)
    }
    onPost(callback) {
        socket.subscribe({
            task: 'general',
            location: 'home'
        }, async data => {
            if (data.type == 'newpost') {
                delete data.type;
                callback(await new Post(data));
            }
        });
    }
    onMention(callback) {
        this.onPost(async post => {
            const postData = await post.getPostData();
            if (post.text.match(`@${this.me.user._id}(${this.me.user.username})`)) {
                callback(post);
            }
        });
    }
    async getPostById(id) {
        let data = await request('posts/?postid=' + id, 'GET');
        return data.posts[0];
    }
}

class Post {
    constructor(post) {
        this.post = post;
    }
    async getPostData() {
        const data = await request('posts/?postid=' + post._id, 'GET');
        console.log(data)
        const postData = await data.posts[0];
        console.log(postData);
        this._id = post._id;
        this.text = postData.Text;
        if (postData.Media) {
            for (let i = 0; i < postData.Media.ImageCount; i++) {
                this.media.push(`${assetURL}/PostImages/${postData._id}/`);
            }
        }
        this.author = new User(data.users[0]);
    }
    onChat() {

    }
    chat() {

    }
}

class Chat {
    reply() {

    }
}

exports.client = client;