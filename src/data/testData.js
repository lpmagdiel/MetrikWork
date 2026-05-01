const apiURL = 'https://dummyjson.com/users/1';

export const fetchUserData = async () => {
    const response = await fetch(apiURL);
    const data = await response.json();
    return data;
}

export const creditCard = {
    number: '4242424242424242',
    name: 'Magdiel Hernandez',
    expiry: '12/25',
    cvv: '123'
}
